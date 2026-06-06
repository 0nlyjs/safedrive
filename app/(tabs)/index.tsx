import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useDrivingSession, DriveSession } from '@/hooks/use-driving-session';
import { DriveSummary } from '@/components/drive-summary';
import { IconSymbol } from '@/components/ui/icon-symbol';
import Svg, { Path, Circle } from 'react-native-svg';

export default function HomeScreen() {

  const {
    isDriving,
    isCalibrating,
    calibrationProgress,
    duration,
    distance,
    currentSpeed,
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
    permissionsGranted,
    requestPermissions,
    history,
  } = useDrivingSession();

  // Modal for final summary
  const [summarySession, setSummarySession] = useState<DriveSession | null>(null);
  const [isSummaryVisible, setIsSummaryVisible] = useState(false);

  // Maintain local history of sensor data to draw sparklines (sliding window of 25 points)
  const [gForceHistory, setGForceHistory] = useState<number[]>(new Array(25).fill(0));
  const [yawHistory, setYawHistory] = useState<number[]>(new Array(25).fill(0));
  const [tiltHistory, setTiltHistory] = useState<number[]>(new Array(25).fill(0));

  // Alert overlay for when an event triggers
  const [activeAlert, setActiveAlert] = useState<{ title: string; penalty: number; id: string } | null>(null);
  const alertTimeoutRef = useRef<any>(null);

  // Update sensor histories when new data arrives
  useEffect(() => {
    if (!isDriving || isCalibrating) return;

    // Calculate current metrics
    // G-Force magnitude excluding gravity
    const ax = sensorData.userAccel.x;
    const ay = sensorData.userAccel.y;
    const az = sensorData.userAccel.z;
    const gMag = Math.sqrt(ax * ax + ay * ay + az * az) / 9.81;

    // Yaw rate magnitude (rotation around vertical axis)
    // For visualizer simplicity, take magnitude of rotationRate.alpha
    const yaw = Math.abs(sensorData.rotationRate.alpha);

    // Tilt rate magnitude (pitch and roll rotation rate)
    const tilt = Math.sqrt(
      sensorData.rotationRate.beta * sensorData.rotationRate.beta +
      sensorData.rotationRate.gamma * sensorData.rotationRate.gamma
    );

    setGForceHistory((prev) => [...prev.slice(1), gMag]);
    setYawHistory((prev) => [...prev.slice(1), yaw]);
    setTiltHistory((prev) => [...prev.slice(1), tilt]);
  }, [sensorData, isDriving, isCalibrating]);

  // Monitor newly detected events to show live alert popups
  useEffect(() => {
    if (detectedEvents.length > 0) {
      const latest = detectedEvents[0];
      
      // Cancel previous timer
      if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);

      setActiveAlert({
        title: latest.title,
        penalty: latest.penalty,
        id: latest.id,
      });

      // Hide alert after 3.5 seconds
      alertTimeoutRef.current = setTimeout(() => {
        setActiveAlert(null);
      }, 3500);
    }
  }, [detectedEvents]);

  // Cleanup alert timer
  useEffect(() => {
    return () => {
      if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    };
  }, []);

  // Format Duration (MM:SS)
  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Get score color
  const getScoreColor = (s: number) => {
    if (s >= 90) return '#10B981'; // Green
    if (s >= 80) return '#3B82F6'; // Blue
    if (s >= 70) return '#F59E0B'; // Amber
    return '#EF4444'; // Red
  };

  const handleStartDrive = async () => {
    // Make sure we have permissions before driving if not in simulator mode
    if (!isSimulatorMode && (!permissionsGranted.motion || !permissionsGranted.location)) {
      const granted = await requestPermissions();
      if (!granted) {
        alert('Location and Sensor permissions are required to record a drive.');
        return;
      }
    }
    const success = await startDrive();
    if (!success) {
      alert('Could not start drive session.');
    }
  };

  const handleEndDrive = async () => {
    const session = await endDrive();
    if (session) {
      setSummarySession(session);
      setIsSummaryVisible(true);
    }
  };

  // Helper to draw Svg Sparkline path
  const drawSparkline = (data: number[], height: number, maxVal: number) => {
    const width = 100;
    const padding = 2;
    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      // Clamp and map value to Y coordinate
      const normalized = Math.min(maxVal, val) / maxVal;
      const y = height - padding - normalized * (height - 2 * padding);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${points.join(' L ')}`;
  };

  const lastSavedSession = history.length > 0 ? history[0] : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#090D1A' }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logoText}>SafeDrive</Text>
          <Text style={styles.subLogoText}>Smart Telematics Engine</Text>
        </View>
        <View style={styles.statusPill}>
          <View style={[styles.statusIndicator, { backgroundColor: isDriving ? '#10B981' : '#64748B' }]} />
          <Text style={styles.statusText}>{isDriving ? 'ACTIVE SESSION' : 'IDLE'}</Text>
        </View>
      </View>

      {/* ACTIVE DRIVING DASHBOARD */}
      {isDriving ? (
        <ScrollView contentContainerStyle={styles.activeScroll} showsVerticalScrollIndicator={false}>
          {/* EVENT DETECTED BANNER ALERT */}
          {activeAlert && (
            <View style={styles.alertBanner}>
              <IconSymbol size={20} name="exclamationmark.triangle.fill" color="#EF4444" />
              <View style={styles.alertTextGroup}>
                <Text style={styles.alertTitle}>{activeAlert.title}</Text>
                <Text style={styles.alertSubtitle}>Point Deduction: -{activeAlert.penalty} pts</Text>
              </View>
            </View>
          )}

          {/* CALIBRATION OVERLAY */}
          {isCalibrating ? (
            <View style={styles.calibrationCard}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.calibrationTitle}>Calibrating Sensors...</Text>
              <Text style={styles.calibrationSubtitle}>
                Keep the device stationary or mounted. Aligning phone axes to the vehicle.
              </Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${calibrationProgress}%` }]} />
              </View>
              <Text style={styles.progressText}>{calibrationProgress}%</Text>
            </View>
          ) : (
            <>
              {/* Score Display Gauges */}
              <View style={styles.scoreGaugeContainer}>
                <View style={styles.scoreGaugeWrapper}>
                  <Svg width="180" height="180" viewBox="0 0 180 180" style={{ transform: [{ rotate: '-90deg' }] }}>
                    {/* Background Circle Track */}
                    <Circle
                      cx="90"
                      cy="90"
                      r="76"
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.04)"
                      strokeWidth="8"
                    />
                    {/* Active Progress Circle */}
                    <Circle
                      cx="90"
                      cy="90"
                      r="76"
                      fill="none"
                      stroke={getScoreColor(score)}
                      strokeWidth="8"
                      strokeDasharray={2 * Math.PI * 76}
                      strokeDashoffset={2 * Math.PI * 76 * (1 - score / 100)}
                      strokeLinecap="round"
                    />
                  </Svg>
                  {/* Score Text overlay positioned absolutely inside wrapper */}
                  <View style={styles.innerScoreContentAbsolute}>
                    <Text style={[styles.scoreValue, { color: getScoreColor(score) }]}>{score}</Text>
                    <Text style={styles.scoreLabel}>SAFETY SCORE</Text>
                    <Text style={[styles.ratingPill, { backgroundColor: getScoreColor(score) + '20', color: getScoreColor(score) }]}>
                      {rating}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Live Statistics */}
              <View style={styles.statsDashboard}>
                <View style={styles.statMetric}>
                  <Text style={styles.metricLabel}>DURATION</Text>
                  <Text style={styles.metricValue}>{formatDuration(duration)}</Text>
                </View>
                <View style={styles.statMetricDivider} />
                <View style={styles.statMetric}>
                  <Text style={styles.metricLabel}>SPEED</Text>
                  <Text style={styles.metricValue}>{currentSpeed} <Text style={styles.metricUnit}>km/h</Text></Text>
                </View>
                <View style={styles.statMetricDivider} />
                <View style={styles.statMetric}>
                  <Text style={styles.metricLabel}>DISTANCE</Text>
                  <Text style={styles.metricValue}>{(distance / 1000).toFixed(2)} <Text style={styles.metricUnit}>km</Text></Text>
                </View>
              </View>

              {/* Real-time Oscilloscopes (Telemetry Feed) */}
              <View style={styles.telemetryCard}>
                <Text style={styles.cardHeader}>Live Telemetry Oscilloscope</Text>
                <View style={styles.telemetryGrid}>
                  {/* G-Force */}
                  <View style={styles.telemetryItem}>
                    <View style={styles.telemetryInfo}>
                      <Text style={styles.telemetryLabel}>G-FORCE</Text>
                      <Text style={styles.telemetryVal}>{gForceHistory[gForceHistory.length - 1].toFixed(2)} G</Text>
                    </View>
                    <View style={styles.sparklineBox}>
                      <Svg width="100%" height="40" viewBox="0 0 100 40">
                        <Path d={drawSparkline(gForceHistory, 40, 0.5)} fill="none" stroke="#F59E0B" strokeWidth="1.5" />
                      </Svg>
                    </View>
                  </View>

                  {/* Yaw Rate (Turns) */}
                  <View style={styles.telemetryItem}>
                    <View style={styles.telemetryInfo}>
                      <Text style={styles.telemetryLabel}>YAW RATE</Text>
                      <Text style={styles.telemetryVal}>{yawHistory[yawHistory.length - 1].toFixed(2)} rad/s</Text>
                    </View>
                    <View style={styles.sparklineBox}>
                      <Svg width="100%" height="40" viewBox="0 0 100 40">
                        <Path d={drawSparkline(yawHistory, 40, 0.8)} fill="none" stroke="#3B82F6" strokeWidth="1.5" />
                      </Svg>
                    </View>
                  </View>

                  {/* Pitch / Roll (Phone Handling) */}
                  <View style={styles.telemetryItem}>
                    <View style={styles.telemetryInfo}>
                      <Text style={styles.telemetryLabel}>PHONE TILT</Text>
                      <Text style={styles.telemetryVal}>{tiltHistory[tiltHistory.length - 1].toFixed(2)} rad/s</Text>
                    </View>
                    <View style={styles.sparklineBox}>
                      <Svg width="100%" height="40" viewBox="0 0 100 40">
                        <Path d={drawSparkline(tiltHistory, 40, 1.2)} fill="none" stroke="#A855F7" strokeWidth="1.5" />
                      </Svg>
                    </View>
                  </View>
                </View>
              </View>

              {/* SIMULATOR CONTROLS (IF SIMULATOR ACTIVE) */}
              {isSimulatorMode && (
                <View style={styles.simulatorCard}>
                  <View style={styles.simulatorCardHeader}>
                    <IconSymbol size={16} name="play.desktopcomputer" color="#38BDF8" />
                    <Text style={styles.simulatorTitle}>Interactive Sensor Simulator</Text>
                  </View>
                  <Text style={styles.simulatorInstructions}>
                    Tap buttons to inject mock sensor spikes. Test real-time score penalties and maps:
                  </Text>
                  {activeSimulatorScript !== 'none' ? (
                    <View style={styles.scriptRunningBox}>
                      <ActivityIndicator size="small" color="#38BDF8" style={{ marginRight: 8 }} />
                      <Text style={styles.scriptRunningText}>
                        Running script: <Text style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{activeSimulatorScript} Drive</Text> ({duration}s elapsed)
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.simulatorGrid}>
                      <TouchableOpacity
                        style={[styles.simButton, { borderColor: '#F97316' }]}
                        onPress={() => triggerSimulatedEvent('harsh_brake')}
                      >
                        <Text style={[styles.simButtonText, { color: '#F97316' }]}>🛑 Harsh Brake (-5)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.simButton, { borderColor: '#F59E0B' }]}
                        onPress={() => triggerSimulatedEvent('harsh_acceleration')}
                      >
                        <Text style={[styles.simButtonText, { color: '#F59E0B' }]}>⚡ Harsh Accel (-5)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.simButton, { borderColor: '#3B82F6' }]}
                        onPress={() => triggerSimulatedEvent('sharp_turn')}
                      >
                        <Text style={[styles.simButtonText, { color: '#3B82F6' }]}>↪️ Sharp Turn (-3)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.simButton, { borderColor: '#8B5CF6' }]}
                        onPress={() => triggerSimulatedEvent('aggressive_steering')}
                      >
                        <Text style={[styles.simButtonText, { color: '#8B5CF6' }]}>🔄 Swerve/Steer (-3)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.simButton, { borderColor: '#EF4444' }]}
                        onPress={() => triggerSimulatedEvent('phone_handling')}
                      >
                        <Text style={[styles.simButtonText, { color: '#EF4444' }]}>📱 Phone Handle (-10)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.simButton, { borderColor: '#10B981' }]}
                        onPress={() => triggerSimulatedEvent('excessive_movement')}
                      >
                        <Text style={[styles.simButtonText, { color: '#10B981' }]}>📳 Phone Rattle (-2)</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* LIVE EVENTS LOG */}
              <View style={styles.eventsLogCard}>
                <Text style={styles.cardHeader}>Recent Incidents ({detectedEvents.length})</Text>
                {detectedEvents.length === 0 ? (
                  <Text style={styles.emptyEventsText}>Driving is smooth. No incidents logged.</Text>
                ) : (
                  <View>
                    {detectedEvents.slice(0, 5).map((evt) => (
                      <View key={evt.id} style={styles.eventLogItem}>
                        <View style={styles.eventLogHeader}>
                          <Text style={styles.eventLogTitle}>{evt.title}</Text>
                          <Text style={styles.eventLogPenalty}>-{evt.penalty} pts</Text>
                        </View>
                        <Text style={styles.eventLogTimestamp}>
                          Time: {new Date(evt.timestamp).toLocaleTimeString()} | Mag: {evt.magnitude.toFixed(2)}
                        </Text>
                      </View>
                    ))}
                    {detectedEvents.length > 5 && (
                      <Text style={styles.moreEventsText}>
                        + {detectedEvents.length - 5} more events. End drive to view all.
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </>
          )}

          {/* DRIVING SESSION CONTROLS */}
          <View style={styles.actionContainer}>
            <TouchableOpacity style={styles.endDriveButton} onPress={handleEndDrive}>
              <Text style={styles.actionButtonText}>End Drive</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.discardButton} onPress={discardDrive}>
              <Text style={styles.discardButtonText}>Discard Drive</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        /* IDLE SCREEN DASHBOARD */
        <ScrollView contentContainerStyle={styles.idleScroll} showsVerticalScrollIndicator={false}>
          {/* Welcome Card */}
          <View style={styles.welcomeCard}>
            <Text style={styles.welcomeTitle}>Drive Safely. Score High.</Text>
            <Text style={styles.welcomeSubtitle}>
              Analyze your driving patterns, detect harsh events, and get auto-generated driving coach feedback using device sensors.
            </Text>
          </View>

          {/* PERMISSIONS CARD */}
          {!isSimulatorMode && (
            <View style={styles.permCard}>
              <Text style={styles.cardHeader}>Hardware Integration Status</Text>
              <View style={styles.permRow}>
                <View style={styles.permItem}>
                  <IconSymbol
                    size={22}
                    name={permissionsGranted.motion ? 'checkmark.circle.fill' : 'exclamationmark.circle.fill'}
                    color={permissionsGranted.motion ? '#10B981' : '#F59E0B'}
                  />
                  <Text style={styles.permLabel}>Motion Sensors</Text>
                </View>
                <View style={styles.permItem}>
                  <IconSymbol
                    size={22}
                    name={permissionsGranted.location ? 'checkmark.circle.fill' : 'exclamationmark.circle.fill'}
                    color={permissionsGranted.location ? '#10B981' : '#F59E0B'}
                  />
                  <Text style={styles.permLabel}>GPS Location</Text>
                </View>
              </View>
              {(!permissionsGranted.motion || !permissionsGranted.location) && (
                <TouchableOpacity style={styles.grantBtn} onPress={requestPermissions}>
                  <Text style={styles.grantBtnText}>Grant Hardware Access</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* SOURCE MODE SWITCHER */}
          <View style={styles.modeCard}>
            <Text style={styles.cardHeader}>Select Telemetry Source</Text>
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[styles.toggleBtn, !isSimulatorMode && styles.toggleBtnActive]}
                onPress={() => setIsSimulatorMode(false)}
              >
                <IconSymbol size={16} name="iphone" color={!isSimulatorMode ? '#FFFFFF' : '#94A3B8'} />
                <Text style={[styles.toggleBtnText, !isSimulatorMode && styles.toggleBtnTextActive]}>
                  Real Sensors
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, isSimulatorMode && styles.toggleBtnActive]}
                onPress={() => setIsSimulatorMode(true)}
              >
                <IconSymbol size={16} name="play.desktopcomputer" color={isSimulatorMode ? '#FFFFFF' : '#94A3B8'} />
                <Text style={[styles.toggleBtnText, isSimulatorMode && styles.toggleBtnTextActive]}>
                  Simulator Mode
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modeDescription}>
              {isSimulatorMode
                ? '💻 Recommended for Simulators & Web browsers. Injects mock sensor profiles and routes.'
                : '🚗 Mounts sensors inside your vehicle to track actual acceleration, steering, and braking.'}
            </Text>
          </View>

          {/* START DRIVING MAIN BUTTON */}
          <View style={styles.startSection}>
            <TouchableOpacity style={styles.startDriveBtn} onPress={handleStartDrive}>
              <View style={styles.glowingCore} />
              <Text style={styles.startDriveBtnText}>START DRIVE</Text>
            </TouchableOpacity>
          </View>

          {/* SCRIPTED SIMULATION SCENARIO LAUNCHERS */}
          {isSimulatorMode && (
            <View style={styles.scenariosCard}>
              <Text style={styles.cardHeader}>Demo Script Scenarios</Text>
              <Text style={styles.scenariosSubtitle}>
                Run self-driving simulations and watch the telemetry auto-trigger events:
              </Text>
              <View style={styles.scenariosBtnRow}>
                <TouchableOpacity
                  style={[styles.scenarioBtn, { borderColor: '#10B981' }]}
                  onPress={() => startScriptedSimulation('safe')}
                >
                  <Text style={[styles.scenarioBtnText, { color: '#10B981' }]}>🟢 Safe Drive (30s)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.scenarioBtn, { borderColor: '#EF4444' }]}
                  onPress={() => startScriptedSimulation('aggressive')}
                >
                  <Text style={[styles.scenarioBtnText, { color: '#EF4444' }]}>🔴 Aggressive Drive (60s)</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* LAST DRIVE HISTORY CARD */}
          {lastSavedSession && (
            <View style={styles.lastDriveCard}>
              <Text style={styles.cardHeader}>Last Driving Session</Text>
              <View style={styles.lastDriveContent}>
                <View style={[styles.lastDriveScoreBadge, { backgroundColor: getScoreColor(lastSavedSession.score) + '20', borderColor: getScoreColor(lastSavedSession.score) }]}>
                  <Text style={[styles.lastDriveScoreVal, { color: getScoreColor(lastSavedSession.score) }]}>
                    {lastSavedSession.score}
                  </Text>
                  <Text style={[styles.lastDriveScoreLbl, { color: getScoreColor(lastSavedSession.score) }]}>Score</Text>
                </View>
                <View style={styles.lastDriveDetails}>
                  <Text style={styles.lastDriveRating}>{lastSavedSession.rating} Rating</Text>
                  <Text style={styles.lastDriveStatText}>
                    Duration: {formatDuration(lastSavedSession.duration)} | Dist: {(lastSavedSession.distance / 1000).toFixed(2)} km
                  </Text>
                  <Text style={styles.lastDriveStatText}>
                    Events: {lastSavedSession.events.length} logged
                  </Text>
                  <Text style={styles.lastDriveDate}>
                    {new Date(lastSavedSession.endTime).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.viewDetailsBtn}
                onPress={() => {
                  setSummarySession(lastSavedSession);
                  setIsSummaryVisible(true);
                }}
              >
                <Text style={styles.viewDetailsBtnText}>View Full Coaching Breakdown</Text>
                <IconSymbol size={14} name="arrow.right" color="#6366F1" />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* FULL SESSION DETAILED SUMMARY MODAL */}
      <Modal visible={isSummaryVisible} animationType="slide" presentationStyle="fullScreen">
        {summarySession && (
          <DriveSummary
            session={summarySession}
            onClose={() => {
              setIsSummaryVisible(false);
              setSummarySession(null);
            }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  logoText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  subLogoText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  idleScroll: {
    padding: 20,
  },
  activeScroll: {
    padding: 20,
  },
  welcomeCard: {
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: '#94A3B8',
  },
  permCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 20,
  },
  cardHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#E2E8F0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  permRow: {
    flexDirection: 'row',
    gap: 20,
  },
  permItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  permLabel: {
    fontSize: 13,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  grantBtn: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderColor: 'rgba(99, 102, 241, 0.2)',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  grantBtnText: {
    color: '#818CF8',
    fontWeight: 'bold',
    fontSize: 12,
  },
  modeCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 25,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 10,
    padding: 4,
    marginBottom: 10,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: '#6366F1',
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
  },
  modeDescription: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  startSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 15,
  },
  startDriveBtn: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    borderWidth: 8,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  glowingCore: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  startDriveBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 1,
  },
  scenariosCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 20,
    marginTop: 15,
  },
  scenariosSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 12,
  },
  scenariosBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  scenarioBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  scenarioBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  lastDriveCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 40,
  },
  lastDriveContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  lastDriveScoreBadge: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  lastDriveScoreVal: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  lastDriveScoreLbl: {
    fontSize: 8,
    textTransform: 'uppercase',
    fontWeight: 'bold',
    marginTop: -2,
  },
  lastDriveDetails: {
    flex: 1,
  },
  lastDriveRating: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  lastDriveStatText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  lastDriveDate: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 4,
  },
  viewDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.03)',
  },
  viewDetailsBtnText: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    marginBottom: 20,
  },
  alertTextGroup: {
    flex: 1,
  },
  alertTitle: {
    color: '#FCA5A5',
    fontWeight: 'bold',
    fontSize: 14,
  },
  alertSubtitle: {
    color: '#FECACA',
    fontSize: 11,
    marginTop: 2,
  },
  calibrationCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 40,
  },
  calibrationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginTop: 15,
  },
  calibrationSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 3,
    width: '100%',
    marginTop: 20,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: 'bold',
    marginTop: 6,
  },
  scoreGaugeContainer: {
    alignItems: 'center',
    marginVertical: 15,
  },
  scoreGaugeWrapper: {
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  innerScoreContentAbsolute: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    fontSize: 52,
    fontWeight: '900',
  },
  scoreLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: -4,
  },
  ratingPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 6,
    textTransform: 'uppercase',
  },
  statsDashboard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  statMetric: {
    flex: 1,
    alignItems: 'center',
  },
  statMetricDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 4,
  },
  metricLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginTop: 4,
  },
  metricUnit: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: 'normal',
  },
  telemetryCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 20,
  },
  telemetryGrid: {
    gap: 12,
  },
  telemetryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    padding: 10,
    borderRadius: 12,
  },
  telemetryInfo: {
    flex: 1.2,
  },
  telemetryLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#64748B',
  },
  telemetryVal: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#E2E8F0',
    marginTop: 2,
  },
  sparklineBox: {
    flex: 2,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  simulatorCard: {
    backgroundColor: 'rgba(56, 189, 248, 0.06)',
    borderColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  simulatorCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  simulatorTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#38BDF8',
    textTransform: 'uppercase',
  },
  simulatorInstructions: {
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 12,
  },
  scriptRunningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  scriptRunningText: {
    fontSize: 11,
    color: '#38BDF8',
  },
  simulatorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  simButton: {
    flexBasis: '48%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  simButtonText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  eventsLogCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 30,
  },
  emptyEventsText: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 15,
  },
  eventsScrollView: {
    maxHeight: 150,
  },
  eventLogItem: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
    paddingVertical: 10,
  },
  eventLogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventLogTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#E2E8F0',
  },
  eventLogPenalty: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  eventLogTimestamp: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  actionContainer: {
    gap: 12,
    marginBottom: 40,
  },
  endDriveButton: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  discardButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  discardButtonText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
  moreEventsText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
});
