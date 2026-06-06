# SafeDrive: Smart Mobile Telematics & Driving Safety Analyzer

SafeDrive is a mobile application built on Expo (React Native) designed to analyze real-world driving behavior using smartphone sensors. By reading the accelerometer, gyroscope, device motion, and GPS data, the app detects anomalous events such as **harsh braking**, **sudden acceleration**, **sharp turns**, **swerving (aggressive steering)**, **phone handling**, and **excessive device vibration**. It calculates a real-time safety score and rating, providing drivers with a personalized coaching breakdown at the end of their drive.

---

## 🚀 Key Features

* **Real-time Calibration**: An initial 3-second calibration phase measures the gravity vector, allowing the phone to be mounted at **any tilt angle** while preserving detection accuracy.
* **Orientation-Independent Physics Engine**: Resolves raw sensor readings into a unified coordinate system relative to the vehicle (forward/backward, lateral, and vertical) using gravity vector projections.
* **Interactive Sensor Simulator**: A collapsible simulator dashboard allowing testers and evaluators to trigger simulated events (e.g. harsh brakes, phone tilt) in browser environments and simulators where physical sensors are unavailable.
* **Telemetry Oscilloscopes**: Real-time scrolling sparkline graphs showing active G-force, turning rate, and phone rotation rates.
* **Interactive Route Map & Pins**: Generates route paths and maps event markers (utilizing native MapView with a fallback to responsive SVG lines on the Web/Simulator).
* **AI-Style Driving Coach Feedback**: Generates detailed, rule-based coaching feedback suggesting specific adjustments based on detected infractions.
* **Drive History & Analytics**: Persists drives locally via `AsyncStorage` and visualizes safety score progression on an SVG trend line graph.

---

## 🛠️ Tech Stack

* **Framework**: React Native with [Expo SDK 55](https://docs.expo.dev/versions/v55.0.0/)
* **Navigation**: Expo Router (File-based Routing)
* **Sensor Access**: `expo-sensors` (`DeviceMotion`, `Accelerometer`, `Gyroscope`)
* **GPS & Navigation**: `expo-location` (speed tracking, distance accumulation, coordinate mapping)
* **Storage**: `@react-native-async-storage/async-storage` (local session persistence)
* **Maps**: `react-native-maps` (with fallback to custom SVG path scaling on Web)
* **Visualizations**: `react-native-svg` (telemetry oscilloscopes and history trend graphs)
* **Haptics**: `expo-haptics` (tactile alerts for harsh events)

---

## 📐 Sensor Integration & Event Detection Strategy

To ensure that the app works regardless of how the phone is oriented (whether it is lying flat, tilted on a mount, or upside down), SafeDrive runs a **3D vector projection calibration**:

### 1. Vector Projection & Coordinate Calibration
1. **Gravity Alignment**: In the first 3 seconds, the app samples the Accelerometer to find the average gravity vector:
   $$\vec{g} = (g_x, g_y, g_z)$$
2. **Vertical Unit Vector**: Normalizing the gravity vector gives the vertical coordinate pointing straight down relative to the earth:
   $$\hat{u}_{vert} = \frac{\vec{g}}{||\vec{g}||} = (u_x, u_y, u_z)$$
3. **Vertical User Acceleration**: User acceleration $\vec{a}$ (with gravity subtracted by the OS via `DeviceMotion.acceleration`) is projected onto the vertical axis:
   $$a_{vert} = \vec{a} \cdot \hat{u}_{vert} = a_x u_x + a_y u_y + a_z u_z$$
4. **Horizontal user Acceleration**: Subtracting the vertical component leaves the pure horizontal force experienced by the vehicle during speed adjustments and turns:
   $$\vec{a}_{horiz} = \vec{a} - a_{vert} \hat{u}_{vert}$$
   $$a_{horiz} = ||\vec{a}_{horiz}|| = \sqrt{a_{horiz,x}^2 + a_{horiz,y}^2 + a_{horiz,z}^2}$$
5. **Vehicle Yaw Rate (Turn Rate)**: The Gyroscope vector $\vec{\omega}$ is projected onto the vertical unit vector to find the yaw rotation rate around the gravity axis (which is independent of phone tilt):
   $$\omega_{yaw} = \vec{\omega} \cdot \hat{u}_{vert} = \omega_x u_x + \omega_y u_y + \omega_z u_z$$
6. **Phone Tilt Rate (Pitch & Roll)**: Rotations perpendicular to the vertical axis represent local phone handling:
   $$\omega_{tilt} = \sqrt{||\vec{\omega}||^2 - \omega_{yaw}^2}$$

---

## 📊 Threshold Values Chosen & Physics-based Rationale

The following thresholds were defined based on passenger vehicle physics and telematics standards:

| Event Type | Threshold Formula / Value | Time Over Threshold | Score Penalty | Physics-Based Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Harsh Braking** | $a_{horiz} > 3.43\text{ m/s}^2$ ($0.35g$) and $v_{accel} < -0.5\text{ m/s}^2$ | $\ge 0.8\text{ seconds}$ | **-5** | Deceleration exceeding $0.35g$ corresponds to sudden stops, typically caused by tailgating. |
| **Harsh Acceleration** | $a_{horiz} > 2.94\text{ m/s}^2$ ($0.30g$) and $v_{accel} \ge -0.5\text{ m/s}^2$ | $\ge 0.8\text{ seconds}$ | **-5** | Accelerations exceeding $0.30g$ signify aggressive throttle input, increasing fuel burn and accident risk. |
| **Sharp Turn** | $|\omega_{yaw}| > 0.45\text{ rad/s}$ ($\approx 25^\circ/\text{s}$) | $\ge 1.0\text{ seconds}$ | **-3** | Entering curves at speed results in high lateral friction. A turn rate $> 25^\circ/\text{s}$ indicates cornering too fast. |
| **Aggressive Steering / Swerve** | Yaw rate direction flips ($+\omega_{yaw} \to -\omega_{yaw}$) | Peak-to-peak amplitude $> 0.65\text{ rad/s}$ within $1.5\text{s}$ | **-3** | Quick lane weaving or swerving causes rapid, high-amplitude yaw rate oscillations. |
| **Excessive Device Movement** | $||\vec{a}_{user}|| > 7.50\text{ m/s}^2$ | Instantaneous spike | **-2** | Large G-force spikes lasting $<0.3\text{s}$ without vehicle turns suggest the phone is loose, sliding, or has dropped. |
| **Phone Handling** | $\omega_{tilt} > 0.70\text{ rad/s}$ ($\approx 40^\circ/\text{s}$) | $\ge 1.2\text{ seconds}$ while speed $> 5\text{ km/h}$ | **-10** | Tilt adjustments while the vehicle is in motion represent physical handling of the phone, a high-distraction hazard. |

---

## 💯 Driving Score & Safety Rating System

Every drive starts with a safety score of **100**. Deductions are applied dynamically as events are logged (points cannot drop below 0). The final score determines the safety rating:

* **Excellent (90–100)**: Exceptionally safe driving; minimal or zero violations.
* **Good (80–89)**: Safe driving; minor slips in speed adjustments or turns.
* **Average (70–79)**: Inconsistent habits; frequent sudden brakes or acceleration.
* **Risky (< 70)**: High frequency of dangerous actions, particularly phone usage.

---

## 💻 How to Run Locally

### 1. Prerequisites
Ensure you have Node.js (v18+) and npm installed.

### 2. Install Project Dependencies
Clone the repository and run:
```bash
npm install
```

### 3. Start Expo Bundler
Run the following command in the project root:
```bash
npx expo start
```

### 4. Running Platforms
* **Web**: Press **`w`** in the terminal to launch the dashboard in your default browser.
* **Simulator/Emulator**: Press **`i`** (iOS Simulator) or **`a`** (Android Emulator).
* **Physical Device**: Install the **Expo Go** app on your phone, and scan the QR code displayed in the terminal.

*Note: Since web browsers and simulators do not have physical motion hardware, enable **Simulator Mode** in the app header/dashboard to use the Interactive Simulator.*

---

## 🧠 Assumptions Made

1. **Mounting State**: We assume the phone is relatively secure during the drive (either in a dashboard cradle, cup holder, or glove box). Rapid shaking that doesn't map to driving maneuvers is classified as "Excessive Device Movement".
2. **Speed Updates**: GPS speed updates are assumed to arrive at approximately 1Hz. In the absence of GPS reception, the app continues to run event detection using pure sensor physics and calibrates deceleration based on nose-dive vertical projections.
3. **Vehicle Category**: Thresholds are tuned for standard **passenger vehicles** (sedans, SUVs). Larger commercial vehicles (vans, semi-trucks) generally require lower cornering G-force thresholds ($0.2g$–$0.25g$) to avoid rollovers.
