import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { DeviceMotion, Accelerometer, Gyroscope } from 'expo-sensors';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type EventType =
  | 'harsh_brake'
  | 'harsh_acceleration'
  | 'sharp_turn'
  | 'aggressive_steering'
  | 'excessive_movement'
  | 'phone_handling';

export interface DrivingEvent {
  id: string;
  type: EventType;
  title: string;
  timestamp: number;
  magnitude: number; // in m/s^2 or rad/s
  penalty: number;
  coordinate?: {
    latitude: number;
    longitude: number;
  };
}

export interface DriveSession {
  id: string;
  startTime: number;
  endTime: number;
  duration: number; // in seconds
  distance: number; // in meters
  averageSpeed: number; // in km/h
  maxSpeed: number; // in km/h
  score: number;
  rating: 'Excellent' | 'Good' | 'Average' | 'Risky';
  events: DrivingEvent[];
  route: Array<{ latitude: number; longitude: number; timestamp: number }>;
  feedback: string;
}

interface SensorData {
  accel: { x: number; y: number; z: number };
  gyro: { x: number; y: number; z: number };
  userAccel: { x: number; y: number; z: number };
  rotation: { alpha: number; beta: number; gamma: number };
  rotationRate: { alpha: number; beta: number; gamma: number };
}

interface DrivingSessionContextProps {
  isDriving: boolean;
  isCalibrating: boolean;
  calibrationProgress: number; // 0 to 100
  duration: number; // in seconds
  distance: number; // in meters
  currentSpeed: number; // in km/h
  maxSpeed: number; // in km/h
  routeCoordinates: Array<{ latitude: number; longitude: number; timestamp: number }>;
  detectedEvents: DrivingEvent[];
  score: number;
  rating: 'Excellent' | 'Good' | 'Average' | 'Risky';
  sensorData: SensorData;
  isSimulatorMode: boolean;
  activeSimulatorScript: 'none' | 'safe' | 'aggressive';
  setIsSimulatorMode: (val: boolean) => void;
  startDrive: () => Promise<boolean>;
  endDrive: () => Promise<DriveSession | null>;
  discardDrive: () => void;
  triggerSimulatedEvent: (type: EventType) => void;
  startScriptedSimulation: (script: 'safe' | 'aggressive') => void;
  stopScriptedSimulation: () => void;
  permissionsGranted: { motion: boolean; location: boolean };
  requestPermissions: () => Promise<boolean>;
  history: DriveSession[];
  loadHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
}

const DrivingSessionContext = createContext<DrivingSessionContextProps | undefined>(undefined);

// Point deductions mapping
export const EVENT_PENALTIES: Record<EventType, number> = {
  harsh_brake: 5,
  harsh_acceleration: 5,
  sharp_turn: 3,
  aggressive_steering: 3,
  excessive_movement: 2,
  phone_handling: 10,
};

export const EVENT_TITLES: Record<EventType, string> = {
  harsh_brake: 'Harsh Braking',
  harsh_acceleration: 'Harsh Acceleration',
  sharp_turn: 'Sharp Cornering',
  aggressive_steering: 'Aggressive Steering',
  excessive_movement: 'Excessive Device Motion',
  phone_handling: 'Phone Usage Detected',
};

const HISTORY_STORAGE_KEY = '@safedrive_history';

// Default coordinates centered on a scenic drive route in San Francisco (e.g. Golden Gate / Presidio)
const MOCK_START_COORDINATE = { latitude: 37.7983, longitude: -122.4662 };

export const DrivingSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Drive States
  const [isDriving, setIsDriving] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [distance, setDistance] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [routeCoordinates, setRouteCoordinates] = useState<
    Array<{ latitude: number; longitude: number; timestamp: number }>
  >([]);
  const [detectedEvents, setDetectedEvents] = useState<DrivingEvent[]>([]);
  const [score, setScore] = useState(100);
  const [rating, setRating] = useState<'Excellent' | 'Good' | 'Average' | 'Risky'>('Excellent');

  // Permissions State
  const [permissionsGranted, setPermissionsGranted] = useState({ motion: false, location: false });

  // Simulator States
  const [isSimulatorMode, setIsSimulatorModeState] = useState(Platform.OS === 'web');
  const [activeSimulatorScript, setActiveSimulatorScript] = useState<'none' | 'safe' | 'aggressive'>('none');

  // History State
  const [history, setHistory] = useState<DriveSession[]>([]);

  // Live sensor values for telemetry display
  const [sensorData, setSensorData] = useState<SensorData>({
    accel: { x: 0, y: 0, z: 0 },
    gyro: { x: 0, y: 0, z: 0 },
    userAccel: { x: 0, y: 0, z: 0 },
    rotation: { alpha: 0, beta: 0, gamma: 0 },
    rotationRate: { alpha: 0, beta: 0, gamma: 0 },
  });

  // Refs for background loops and event tracking
  const durationTimerRef = useRef<any>(null);
  const simulatorTimerRef = useRef<any>(null);
  const motionSubscriptionRef = useRef<any>(null);
  const locationSubscriptionRef = useRef<any>(null);

  // Calibration vectors
  const gravityVectorRef = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: -9.81 });
  const calibrationSamplesRef = useRef<Array<{ x: number; y: number; z: number }>>([]);
  const forwardVectorRef = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 1, z: 0 });
  const isCalibratedRef = useRef(false);

  // Time-over-threshold trackings to filter out quick noise
  const harshBrakeTimeOverRef = useRef<number>(0);
  const harshAccelTimeOverRef = useRef<number>(0);
  const sharpTurnTimeOverRef = useRef<number>(0);
  const steeringOscillationRef = useRef<{ lastPeakTime: number; lastPeakVal: number; direction: number }>({
    lastPeakTime: 0,
    lastPeakVal: 0,
    direction: 0,
  });
  const phoneHandlingTimeOverRef = useRef<number>(0);
  const lastEventTriggerTimeRef = useRef<Record<EventType, number>>({
    harsh_brake: 0,
    harsh_acceleration: 0,
    sharp_turn: 0,
    aggressive_steering: 0,
    excessive_movement: 0,
    phone_handling: 0,
  });

  // Keep latest state in ref to avoid react closure stale state in fast sensor callbacks
  const stateRef = useRef({
    isDriving,
    isCalibrating,
    score,
    currentSpeed,
    detectedEvents,
    routeCoordinates,
  });

  useEffect(() => {
    stateRef.current = {
      isDriving,
      isCalibrating,
      score,
      currentSpeed,
      detectedEvents,
      routeCoordinates,
    };
  }, [isDriving, isCalibrating, score, currentSpeed, detectedEvents, routeCoordinates]);

  // Load history on startup
  useEffect(() => {
    loadHistory();
    checkPermissionsSilently();
  }, []);

  // Update rating based on score
  useEffect(() => {
    if (score >= 90) setRating('Excellent');
    else if (score >= 80) setRating('Good');
    else if (score >= 70) setRating('Average');
    else setRating('Risky');
  }, [score]);

  // Check permissions silently on startup
  const checkPermissionsSilently = async () => {
    try {
      if (Platform.OS === 'web') {
        setPermissionsGranted({ motion: true, location: true });
        return;
      }

      // Check Location permissions
      const { status: locStatus } = await Location.getForegroundPermissionsAsync();
      const motionAvail = await DeviceMotion.isAvailableAsync();

      setPermissionsGranted({
        motion: motionAvail,
        location: locStatus === 'granted',
      });
    } catch (e) {
      console.warn('Error checking permissions silently:', e);
    }
  };

  const requestPermissions = async () => {
    try {
      if (Platform.OS === 'web') {
        setPermissionsGranted({ motion: true, location: true });
        return true;
      }

      // Request location permissions
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      
      // Device Motion check / prompt
      let motionOk = false;
      try {
        motionOk = await DeviceMotion.isAvailableAsync();
        // Trigger a permission prompt by adding and immediately removing a listener on iOS
        if (Platform.OS === 'ios' && motionOk) {
          const sub = DeviceMotion.addListener(() => {});
          sub.remove();
        }
      } catch (motionErr) {
        console.warn('DeviceMotion permission check failed:', motionErr);
      }

      const granted = {
        motion: motionOk,
        location: locStatus === 'granted',
      };
      setPermissionsGranted(granted);
      return granted.location;
    } catch (e) {
      console.error('Failed to request permissions:', e);
      return false;
    }
  };

  const setIsSimulatorMode = (val: boolean) => {
    if (isDriving) {
      // Cannot switch mode mid-drive
      return;
    }
    setIsSimulatorModeState(val);
  };

  // Load history from AsyncStorage
  const loadHistory = async () => {
    try {
      const stored = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  };

  // Clear all history
  const clearHistory = async () => {
    try {
      await AsyncStorage.removeItem(HISTORY_STORAGE_KEY);
      setHistory([]);
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  };

  // Delete a specific session
  const deleteSession = async (id: string) => {
    try {
      const updated = history.filter((item) => item.id !== id);
      await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      setHistory(updated);
    } catch (e) {
      console.error('Failed to delete history item:', e);
    }
  };

  // Haptic feedback helper
  const triggerHaptic = (type: 'success' | 'warning' | 'error') => {
    if (Platform.OS !== 'web') {
      try {
        if (type === 'success') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (type === 'warning') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else if (type === 'error') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      } catch (e) {
        // Ignore haptics fail
      }
    }
  };

  // Trigger Driving Event
  const logDrivingEvent = (type: EventType, magnitude: number) => {
    const now = Date.now();
    // Throttle duplicate events of same type within 4 seconds (except device movement which can trigger a bit more often)
    const throttleTime = type === 'excessive_movement' ? 2000 : 4000;
    if (now - lastEventTriggerTimeRef.current[type] < throttleTime) {
      return;
    }

    lastEventTriggerTimeRef.current[type] = now;
    triggerHaptic(type === 'phone_handling' ? 'error' : 'warning');

    const penalty = EVENT_PENALTIES[type];
    const newScore = Math.max(0, stateRef.current.score - penalty);
    setScore(newScore);

    // Get current coordinate if available
    const coordinates = stateRef.current.routeCoordinates;
    const currentCoord = coordinates.length > 0 ? coordinates[coordinates.length - 1] : undefined;

    const newEvent: DrivingEvent = {
      id: `${type}_${now}_${Math.random().toString(36).substr(2, 5)}`,
      type,
      title: EVENT_TITLES[type],
      timestamp: now,
      magnitude,
      penalty,
      coordinate: currentCoord
        ? { latitude: currentCoord.latitude, longitude: currentCoord.longitude }
        : undefined,
    };

    setDetectedEvents((prev) => [newEvent, ...prev]);
  };

  // Core sensor calculations and event detection
  const processSensorData = (
    accel: { x: number; y: number; z: number },
    gyro: { x: number; y: number; z: number },
    userAccel: { x: number; y: number; z: number },
    rotRate: { alpha: number; beta: number; gamma: number },
    rot: { alpha: number; beta: number; gamma: number }
  ) => {
    // Save live sensor readings for UI gauges
    setSensorData({
      accel,
      gyro,
      userAccel,
      rotation: rot,
      rotationRate: rotRate,
    });

    if (!stateRef.current.isDriving) return;

    // --- CALIBRATION PHASE ---
    if (stateRef.current.isCalibrating) {
      calibrationSamplesRef.current.push({ ...accel });
      const samplesCount = calibrationSamplesRef.current.length;
      const progress = Math.min(100, Math.round((samplesCount / 30) * 100)); // 30 samples at 10Hz = 3 seconds
      setCalibrationProgress(progress);

      if (samplesCount >= 30) {
        // Compute average gravity vector
        const sum = calibrationSamplesRef.current.reduce(
          (acc, val) => ({ x: acc.x + val.x, y: acc.y + val.y, z: acc.z + val.z }),
          { x: 0, y: 0, z: 0 }
        );
        gravityVectorRef.current = {
          x: sum.x / samplesCount,
          y: sum.y / samplesCount,
          z: sum.z / samplesCount,
        };
        isCalibratedRef.current = true;
        setIsCalibrating(false);
        triggerHaptic('success');
      }
      return;
    }

    // --- PHYSICS CALCULATIONS (ORIENTATION INDEPENDENT) ---
    // 1. Gravity unit vector (downward axis of phone relative to earth)
    const gVec = gravityVectorRef.current;
    const gMag = Math.sqrt(gVec.x * gVec.x + gVec.y * gVec.y + gVec.z * gVec.z) || 9.81;
    const uVert = { x: gVec.x / gMag, y: gVec.y / gMag, z: gVec.z / gMag };

    // 2. Project user acceleration onto vertical axis (v_accel = u_accel . uVert)
    // userAccel represents acceleration excluding gravity in m/s^2.
    const vAccelMag = userAccel.x * uVert.x + userAccel.y * uVert.y + userAccel.z * uVert.z;

    // 3. Subtract vertical component from user acceleration vector to get the horizontal user acceleration vector
    const hAccel = {
      x: userAccel.x - vAccelMag * uVert.x,
      y: userAccel.y - vAccelMag * uVert.y,
      z: userAccel.z - vAccelMag * uVert.z,
    };
    const hAccelMag = Math.sqrt(hAccel.x * hAccel.x + hAccel.y * hAccel.y + hAccel.z * hAccel.z); // in m/s^2

    // 4. Project gyroscope vector (rotation rates) onto vertical gravity axis to get yaw rate (turn rate of car)
    const yawRate = gyro.x * uVert.x + gyro.y * uVert.y + gyro.z * uVert.z; // in rad/s

    // 5. Tilt component of rotation rate (pitch and roll rate, representing phone tilt)
    const pitchRollRate = Math.sqrt(
      gyro.x * gyro.x + gyro.y * gyro.y + gyro.z * gyro.z - yawRate * yawRate
    ) || 0; // in rad/s

    // --- EVENT DETECTION ALGORITHMS ---
    const now = Date.now();

    // 1. Harsh Braking & Acceleration (requires sustained horizontal force)
    const gForceHoriz = hAccelMag / 9.81; // in G's
    const speed = stateRef.current.currentSpeed; // in km/h

    // Baselines: 0.3g threshold for acceleration (2.94 m/s^2), 0.35g for braking (3.43 m/s^2)
    const ACCEL_THRESHOLD_G = 0.30;
    const BRAKE_THRESHOLD_G = 0.35;

    if (gForceHoriz > ACCEL_THRESHOLD_G) {
      // Dynamic determination if braking or accelerating based on forward vector alignment or speed changes
      // In the absence of speed changes, we look at the vector or treat it broadly
      // If we have GPS speed, check acceleration vs deceleration
      const isBraking = speed > 5 && vAccelMag < -0.5; // Decelerating or downward pitch indicates nose dive (braking)
      
      if (isBraking || gForceHoriz > BRAKE_THRESHOLD_G) {
        harshBrakeTimeOverRef.current += 100; // tick rate is 100ms
        if (harshBrakeTimeOverRef.current >= 800) { // 0.8 seconds
          logDrivingEvent('harsh_brake', gForceHoriz);
        }
      } else {
        harshAccelTimeOverRef.current += 100;
        if (harshAccelTimeOverRef.current >= 800) { // 0.8 seconds
          logDrivingEvent('harsh_acceleration', gForceHoriz);
        }
      }
    } else {
      harshBrakeTimeOverRef.current = 0;
      harshAccelTimeOverRef.current = 0;
    }

    // 2. Sharp Turns (yaw rate sustained > 0.45 rad/s)
    const YAW_RATE_THRESHOLD = 0.45; // ~25 degrees per second
    const absYaw = Math.abs(yawRate);
    if (absYaw > YAW_RATE_THRESHOLD) {
      sharpTurnTimeOverRef.current += 100;
      if (sharpTurnTimeOverRef.current >= 1000) { // 1.0 second
        logDrivingEvent('sharp_turn', absYaw);
      }
    } else {
      sharpTurnTimeOverRef.current = 0;
    }

    // 3. Aggressive Steering / Swerving (quick left-to-right steering weave)
    // Detected when yaw rate peaks in one direction, then reverses to opposite direction within 1.5 seconds.
    if (absYaw > 0.30) {
      const direction = Math.sign(yawRate);
      const lastSteer = steeringOscillationRef.current;
      if (lastSteer.direction !== 0 && lastSteer.direction !== direction && now - lastSteer.lastPeakTime < 1500) {
        const peakToPeakVal = absYaw + Math.abs(lastSteer.lastPeakVal);
        if (peakToPeakVal > 0.65) {
          logDrivingEvent('aggressive_steering', peakToPeakVal);
          // reset
          steeringOscillationRef.current = { lastPeakTime: 0, lastPeakVal: 0, direction: 0 };
        }
      } else {
        steeringOscillationRef.current = {
          lastPeakTime: now,
          lastPeakVal: yawRate,
          direction,
        };
      }
    }

    // 4. Phone Handling (Phone tilt changes pitch/roll when vehicle is moving)
    // If phone rotates around local horizontal axes > 0.7 rad/s (40 deg/s) for 1.2s
    const PHONE_ROTATION_THRESHOLD = 0.7;
    // Only flag phone handling if vehicle is moving (> 5 km/h) to avoid false positives when parked
    if (pitchRollRate > PHONE_ROTATION_THRESHOLD && speed > 5) {
      phoneHandlingTimeOverRef.current += 100;
      if (phoneHandlingTimeOverRef.current >= 1200) { // 1.2 seconds
        logDrivingEvent('phone_handling', pitchRollRate);
      }
    } else {
      phoneHandlingTimeOverRef.current = 0;
    }

    // 5. Excessive Device Movement (rattling, sliding, dropping)
    // Standard deviation / magnitude spikes. User acceleration magnitude exceeds 7.5 m/s^2 for a quick spike
    const userAccelMag = Math.sqrt(
      userAccel.x * userAccel.x + userAccel.y * userAccel.y + userAccel.z * userAccel.z
    );
    if (userAccelMag > 7.5) {
      logDrivingEvent('excessive_movement', userAccelMag);
    }
  };

  // Start driving session
  const startDrive = async () => {
    if (isDriving) return false;

    // Reset metrics
    setScore(100);
    setDuration(0);
    setDistance(0);
    setCurrentSpeed(0);
    setMaxSpeed(0);
    setDetectedEvents([]);
    setRouteCoordinates([]);
    
    setIsDriving(true);
    setIsCalibrating(true);
    setCalibrationProgress(0);
    calibrationSamplesRef.current = [];
    isCalibratedRef.current = false;

    // Reset refs
    harshBrakeTimeOverRef.current = 0;
    harshAccelTimeOverRef.current = 0;
    sharpTurnTimeOverRef.current = 0;
    phoneHandlingTimeOverRef.current = 0;
    steeringOscillationRef.current = { lastPeakTime: 0, lastPeakVal: 0, direction: 0 };
    lastEventTriggerTimeRef.current = {
      harsh_brake: 0,
      harsh_acceleration: 0,
      sharp_turn: 0,
      aggressive_steering: 0,
      excessive_movement: 0,
      phone_handling: 0,
    };

    triggerHaptic('success');

    // 1s Interval Timer for duration
    durationTimerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);

    // If simulator mode, start simulator
    if (isSimulatorMode) {
      startSimulatorLoop();
    } else {
      // Start real sensor listeners
      try {
        await DeviceMotion.setUpdateInterval(100);
        motionSubscriptionRef.current = DeviceMotion.addListener((data) => {
          if (!data) return;
          const accel = data.accelerationIncludingGravity || { x: 0, y: 0, z: -9.81 };
          const userAccel = data.acceleration || { x: 0, y: 0, z: 0 };
          const gyroRaw = data.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
          const gyro = { x: gyroRaw.beta, y: gyroRaw.gamma, z: gyroRaw.alpha };
          const rotationRate = data.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
          const rotation = data.rotation || { alpha: 0, beta: 0, gamma: 0 };

          // DeviceMotion listener returns values inside 'data' directly
          // We convert raw accel including gravity from m/s^2 to g's if needed,
          // but processSensorData expects accel (with gravity) in m/s^2, gyro in rad/s, userAccel (no gravity) in m/s^2
          processSensorData(
            accel,
            gyro,
            userAccel,
            rotationRate,
            rotation
          );
        });

        // Start GPS tracking
        locationSubscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000, // Every 1 second
            distanceInterval: 2, // Every 2 meters
          },
          (loc) => {
            const { latitude, longitude, speed } = loc.coords;
            const speedKmh = Math.max(0, (speed || 0) * 3.6); // speed is in m/s, convert to km/h

            setCurrentSpeed(Math.round(speedKmh));
            setMaxSpeed((prev) => Math.round(Math.max(prev, speedKmh)));

            // Calculate distance added
            const nowCoords = { latitude, longitude, timestamp: loc.timestamp };
            setRouteCoordinates((prev) => {
              if (prev.length > 0) {
                const last = prev[prev.length - 1];
                const addedDist = calculateDistance(
                  last.latitude,
                  last.longitude,
                  latitude,
                  longitude
                );
                setDistance((d) => d + addedDist);
              }
              return [...prev, nowCoords];
            });
          }
        );
      } catch (err) {
        console.error('Failed to initialize physical sensors, falling back to simulator:', err);
        setIsSimulatorModeState(true);
        startSimulatorLoop();
      }
    }

    return true;
  };

  // End driving session
  const endDrive = async (): Promise<DriveSession | null> => {
    if (!isDriving) return null;

    // Clear loops
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    if (simulatorTimerRef.current) clearInterval(simulatorTimerRef.current);
    if (motionSubscriptionRef.current) motionSubscriptionRef.current.remove();
    if (locationSubscriptionRef.current) locationSubscriptionRef.current.remove();

    setIsDriving(false);
    setIsCalibrating(false);
    setActiveSimulatorScript('none');

    // Calculate final metrics
    const finalScore = score;
    const finalDuration = duration;
    const finalDistance = distance;
    const finalEvents = detectedEvents;
    const finalRoute = routeCoordinates;
    const finalRating = score >= 90 ? 'Excellent' : score >= 80 ? 'Good' : score >= 70 ? 'Average' : 'Risky';
    
    // Average speed (km/h) = (distance in meters / 1000) / (duration in hours)
    const durationHours = finalDuration / 3600;
    const avgSpeed = durationHours > 0 ? (finalDistance / 1000) / durationHours : 0;

    // Generate driving feedback
    const feedback = generateCoachFeedback(finalEvents, finalScore);

    const session: DriveSession = {
      id: `session_${Date.now()}`,
      startTime: Date.now() - finalDuration * 1000,
      endTime: Date.now(),
      duration: finalDuration,
      distance: finalDistance,
      averageSpeed: Math.round(avgSpeed),
      maxSpeed: maxSpeed,
      score: finalScore,
      rating: finalRating,
      events: finalEvents,
      route: finalRoute,
      feedback,
    };

    // Save session to history if duration is valid (> 3 seconds)
    if (finalDuration >= 3) {
      try {
        const updatedHistory = [session, ...history];
        await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updatedHistory));
        setHistory(updatedHistory);
      } catch (e) {
        console.error('Failed to save session to history:', e);
      }
    }

    triggerHaptic('success');
    return session;
  };

  // Discard driving session without saving
  const discardDrive = () => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    if (simulatorTimerRef.current) clearInterval(simulatorTimerRef.current);
    if (motionSubscriptionRef.current) motionSubscriptionRef.current.remove();
    if (locationSubscriptionRef.current) locationSubscriptionRef.current.remove();

    setIsDriving(false);
    setIsCalibrating(false);
    setActiveSimulatorScript('none');
    setRouteCoordinates([]);
    setDetectedEvents([]);
    setScore(100);
    setDuration(0);
    setDistance(0);
    setCurrentSpeed(0);
  };

  // Haversine distance calculator in meters
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // metres
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
  };

  // Rule-based Driving Coach Feedback generator
  const generateCoachFeedback = (events: DrivingEvent[], finalScore: number): string => {
    if (events.length === 0 && finalScore === 100) {
      return 'Amazing drive! Perfect score of 100. You maintained smooth acceleration, gentle cornering, and kept your phone safely docked. Keep up this stellar driving behavior!';
    }

    const counts = events.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<EventType, number>);

    const feedbackPoints: string[] = [];

    if (counts.phone_handling) {
      feedbackPoints.push(
        `We detected phone usage ${counts.phone_handling} time${counts.phone_handling > 1 ? 's' : ''} during the drive. Using your phone while driving is the single highest hazard, reducing your score by 10 points per occurrence. Always secure your phone in a dashboard mount before starting.`
      );
    }
    if (counts.harsh_brake) {
      feedbackPoints.push(
        `Harsh braking occurred ${counts.harsh_brake} time${counts.harsh_brake > 1 ? 's' : ''}. This usually indicates tailgating or distracted driving. Try scanning further down the road to anticipate traffic stops and start braking earlier.`
      );
    }
    if (counts.harsh_acceleration) {
      feedbackPoints.push(
        `We logged harsh acceleration ${counts.harsh_acceleration} time${counts.harsh_acceleration > 1 ? 's' : ''}. Rapid acceleration burns more fuel and increases crash risks. Squeeze the accelerator gently to transition speeds smoothly.`
      );
    }
    if (counts.sharp_turn || counts.aggressive_steering) {
      const turns = (counts.sharp_turn || 0) + (counts.aggressive_steering || 0);
      feedbackPoints.push(
        `Cornering or steering was marked aggressive ${turns} time${turns > 1 ? 's' : ''}. Entering bends too fast causes vehicle slip. slow down before entering turns, and steer in a gradual, sweeping motion.`
      );
    }
    if (counts.excessive_movement) {
      feedbackPoints.push(
        `Excessive device motion was registered. If the phone is loose, sliding in a cup holder, or falling on the floor, it triggers safety penalties and causes distractions. Secure it tightly.`
      );
    }

    if (feedbackPoints.length === 0) {
      return `Good drive! You scored ${finalScore}/100. Your ride was generally smooth with only minor sensor noise detected. Safe driving starts with constant vigilance!`;
    }

    return `Drive Analysis Summary (Score: ${finalScore}/100):\n\n` + feedbackPoints.map((p, i) => `${i + 1}. ${p}`).join('\n\n');
  };

  // --- SENSOR SIMULATION ENGINE ---
  // Allow manual event injections
  const simulatorOverrideRef = useRef<{ type: EventType; endTime: number } | null>(null);

  const triggerSimulatedEvent = (type: EventType) => {
    if (!isDriving) return;
    const durationOverride = type === 'harsh_brake' || type === 'harsh_acceleration' ? 1200 : 1500;
    simulatorOverrideRef.current = {
      type,
      endTime: Date.now() + durationOverride,
    };
  };

  // Simulated coordinate pathing
  const mockPathIndexRef = useRef(0);
  const mockPathPointsRef = useRef<Array<{ latitude: number; longitude: number }>>([]);

  // Generate a mock driving path starting at MOCK_START_COORDINATE
  const generateMockPath = (steps: number) => {
    const points: Array<{ latitude: number; longitude: number }> = [];
    let lat = MOCK_START_COORDINATE.latitude;
    let lon = MOCK_START_COORDINATE.longitude;
    // Walk in a zig-zag route representing streets
    let headingLat = 0.0001; // drift north
    let headingLon = 0.0000;
    
    for (let i = 0; i < steps; i++) {
      if (i > 0 && i % 10 === 0) {
        // turn left/right every 10 steps
        const temp = headingLat;
        headingLat = headingLon;
        headingLon = temp === 0 ? 0.00012 : -temp;
      }
      lat += headingLat + (Math.random() - 0.5) * 0.00001;
      lon += headingLon + (Math.random() - 0.5) * 0.00001;
      points.push({ latitude: lat, longitude: lon });
    }
    return points;
  };

  const startSimulatorLoop = () => {
    mockPathIndexRef.current = 0;
    mockPathPointsRef.current = generateMockPath(300); // 300 seconds worth of coordinates
    setRouteCoordinates([
      { ...MOCK_START_COORDINATE, timestamp: Date.now() },
    ]);

    // 100ms interval for sensor updates
    let tickCount = 0;
    let speedVal = 0; // km/h

    simulatorTimerRef.current = setInterval(() => {
      if (!stateRef.current.isDriving) return;
      tickCount++;

      // Current override event if active
      const now = Date.now();
      const override = simulatorOverrideRef.current;
      const overrideActive = override && now < override.endTime;

      if (override && now >= override.endTime) {
        simulatorOverrideRef.current = null; // Clear override
      }

      // Default baseline values (minor driving noise)
      let ax = (Math.random() - 0.5) * 0.15;
      let ay = (Math.random() - 0.5) * 0.15;
      let az = -9.81 + (Math.random() - 0.5) * 0.15; // Z includes gravity

      let uax = (Math.random() - 0.5) * 0.2;
      let uay = (Math.random() - 0.5) * 0.2;
      let uaz = (Math.random() - 0.5) * 0.2;

      let gx = (Math.random() - 0.5) * 0.03;
      let gy = (Math.random() - 0.5) * 0.03;
      let gz = (Math.random() - 0.5) * 0.03;

      // Handle Scripted Auto Simulation Timeline overrides
      let scriptEvent: EventType | null = null;
      if (activeSimulatorScript === 'aggressive') {
        const elapsedSecs = Math.floor(tickCount / 10);
        if (elapsedSecs === 5 && tickCount % 10 === 0) triggerSimulatedEvent('harsh_acceleration');
        if (elapsedSecs === 12 && tickCount % 10 === 0) triggerSimulatedEvent('phone_handling');
        if (elapsedSecs === 22 && tickCount % 10 === 0) triggerSimulatedEvent('sharp_turn');
        if (elapsedSecs === 32 && tickCount % 10 === 0) triggerSimulatedEvent('aggressive_steering');
        if (elapsedSecs === 42 && tickCount % 10 === 0) triggerSimulatedEvent('excessive_movement');
        if (elapsedSecs === 50 && tickCount % 10 === 0) triggerSimulatedEvent('harsh_brake');
      }

      // 1. Inject sensor signature depending on active override event
      if (overrideActive && override) {
        scriptEvent = override.type;
        if (override.type === 'harsh_brake') {
          // Harsh braking: massive forward-to-backward force (Y-axis or projected horizontal)
          uay = -4.2; // deceleration in m/s^2
          ay = uay - 3.0; // shifts pitch due to brake force
          speedVal = Math.max(0, speedVal - 3.5); // rapid speed drop
        } else if (override.type === 'harsh_acceleration') {
          // Harsh acceleration: massive forward force
          uay = 3.6; // acceleration in m/s^2
          ay = uay + 2.0;
          speedVal = Math.min(100, speedVal + 2.8); // rapid speed climb
        } else if (override.type === 'sharp_turn') {
          // Sharp turn: massive rotation rate in Z (yaw) and lateral acceleration
          uax = 4.1; // lateral G-force in m/s^2
          ax = uax;
          gz = 0.62; // high turn yaw rate
          speedVal = Math.max(15, speedVal - 0.5); // slow down slightly in turn
        } else if (override.type === 'aggressive_steering') {
          // Swerving: oscillating yaw rate and lateral acceleration
          const wave = Math.sin((tickCount * Math.PI) / 3); // oscillate
          uax = wave * 3.5;
          ax = uax;
          gz = wave * 0.55;
        } else if (override.type === 'phone_handling') {
          // Phone handling: huge pitch (X) and roll (Y) rotation rates
          gx = 0.95; // local X-axis rotation rate
          gy = -0.82; // local Y-axis rotation rate
          speedVal = Math.max(10, speedVal + (Math.random() - 0.5) * 0.5); // cruise speed drifting
        } else if (override.type === 'excessive_movement') {
          // Phone rattling/falling: huge random spikes on all axes
          uax = (Math.random() - 0.5) * 16.0;
          uay = (Math.random() - 0.5) * 16.0;
          uaz = (Math.random() - 0.5) * 16.0;
          ax = uax;
          ay = uay;
          az = -9.81 + uaz;
        }
      } else {
        // Normal simulated speed changes
        if (stateRef.current.isCalibrating) {
          speedVal = 0;
        } else {
          // Slowly accelerate to cruising speed
          if (speedVal < 45) {
            speedVal += 0.25;
            uay = 0.8; // gentle accel
          } else {
            // cruising speed oscillation
            speedVal = 45 + Math.sin(tickCount / 10) * 1.5;
            uay = Math.sin(tickCount / 10) * 0.1;
          }
        }
      }

      // 2. Calibrate/process mock sensor tick
      processSensorData(
        { x: ax, y: ay, z: az },
        { x: gx, y: gy, z: gz },
        { x: uax, y: uay, z: uaz },
        { alpha: gz, beta: gx, gamma: gy },
        { alpha: 0.1, beta: 0.2, gamma: 0.3 }
      );

      // 3. Location update simulator (every 10 ticks = 1 second)
      if (tickCount % 10 === 0 && !stateRef.current.isCalibrating) {
        setCurrentSpeed(Math.round(speedVal));
        setMaxSpeed((prev) => Math.round(Math.max(prev, speedVal)));

        const pathIdx = mockPathIndexRef.current;
        const pts = mockPathPointsRef.current;

        if (pts.length > 0 && pathIdx < pts.length) {
          const pt = pts[pathIdx];
          const newCoord = { ...pt, timestamp: Date.now() };

          setRouteCoordinates((prev) => {
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              const addedDist = calculateDistance(
                last.latitude,
                last.longitude,
                pt.latitude,
                pt.longitude
              );
              setDistance((d) => d + addedDist);
            }
            return [...prev, newCoord];
          });

          mockPathIndexRef.current = pathIdx + 1;
        }
      }
    }, 100);
  };

  const startScriptedSimulation = (script: 'safe' | 'aggressive') => {
    if (isDriving) return;
    setIsSimulatorModeState(true);
    setActiveSimulatorScript(script);
    startDrive();
  };

  const stopScriptedSimulation = () => {
    endDrive();
  };

  return (
    <DrivingSessionContext.Provider
      value={{
        isDriving,
        isCalibrating,
        calibrationProgress,
        duration,
        distance,
        currentSpeed,
        maxSpeed,
        routeCoordinates,
        detectedEvents,
        score,
        rating,
        sensorData,
        isSimulatorMode,
        activeSimulatorScript,
        setIsSimulatorMode,
        startDrive,
        endDrive,
        discardDrive,
        triggerSimulatedEvent,
        startScriptedSimulation,
        stopScriptedSimulation,
        permissionsGranted,
        requestPermissions,
        history,
        loadHistory,
        clearHistory,
        deleteSession,
      }}>
      {children}
    </DrivingSessionContext.Provider>
  );
};

export const useDrivingSession = () => {
  const context = useContext(DrivingSessionContext);
  if (context === undefined) {
    throw new Error('useDrivingSession must be used within a DrivingSessionProvider');
  }
  return context;
};
