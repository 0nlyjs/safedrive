import React from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { DrivingEvent } from '@/hooks/use-driving-session';
import { IconSymbol } from './ui/icon-symbol';
import Svg, { Path, Circle, Rect, G, Defs, Pattern, Text as SvgText } from 'react-native-svg';

let MapView: any;
let Polyline: any;
let Marker: any;

if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Polyline = Maps.Polyline;
    Marker = Maps.Marker;
  } catch (e) {
    console.warn('react-native-maps failed to load', e);
  }
}

interface RouteMapProps {
  route: { latitude: number; longitude: number; timestamp: number }[];
  events: DrivingEvent[];
  height?: number;
}

export const RouteMap: React.FC<RouteMapProps> = ({ route, events, height = 200 }) => {
  const isWeb = Platform.OS === 'web';
  const hasMap = !isWeb && MapView;

  // If no route coordinates, show fallback immediately
  if (route.length === 0) {
    return (
      <View style={[styles.fallbackContainer, { height }, styles.center]}>
        <IconSymbol size={32} name="map.fill" color="#64748B" />
        <Text style={[styles.fallbackText, { marginTop: 8 }]}>No route data available</Text>
      </View>
    );
  }

  // If on native but MapView is not loaded
  if (!isWeb && !hasMap) {
    return (
      <View style={[styles.fallbackContainer, { height }, styles.center]}>
        <IconSymbol size={32} name="map.fill" color="#64748B" />
        <Text style={[styles.fallbackText, { marginTop: 8 }]}>Map Visualizer Unavailable</Text>
      </View>
    );
  }

  // Web Fallback: Renders a beautiful SVG path scaled to fit the view
  if (isWeb) {

    // Find bounding box to scale coordinates to SVG space (e.g. 300x150)
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    route.forEach((pt) => {
      if (pt.latitude < minLat) minLat = pt.latitude;
      if (pt.latitude > maxLat) maxLat = pt.latitude;
      if (pt.longitude < minLon) minLon = pt.longitude;
      if (pt.longitude > maxLon) maxLon = pt.longitude;
    });

    const latRange = maxLat - minLat || 0.0001;
    const lonRange = maxLon - minLon || 0.0001;

    // SVG dimensions
    const width = 300;
    const svgHeight = height;
    const padding = 20;

    // Map latitude/longitude to SVG X/Y
    // Latitude increases going north (upwards), so Y should be inverted
    const mapToSvg = (lat: number, lon: number) => {
      const x = padding + ((lon - minLon) / lonRange) * (width - 2 * padding);
      const y = svgHeight - padding - ((lat - minLat) / latRange) * (svgHeight - 2 * padding);
      return { x, y };
    };

    // Construct path
    const pathPoints = route.map((pt) => {
      const { x, y } = mapToSvg(pt.latitude, pt.longitude);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const pathD = `M ${pathPoints.join(' L ')}`;

    // Color definitions for event markers
    const getEventColor = (type: string) => {
      switch (type) {
        case 'phone_handling': return '#EF4444'; // Red
        case 'harsh_brake': return '#F97316'; // Orange
        case 'harsh_acceleration': return '#F59E0B'; // Amber
        case 'sharp_turn': return '#3B82F6'; // Blue
        case 'aggressive_steering': return '#8B5CF6'; // Purple
        case 'excessive_movement': return '#10B981'; // Emerald
        default: return '#9CA3AF';
      }
    };

    // Abbreviate event names for pin badges
    const getEventBadge = (type: string) => {
      switch (type) {
        case 'phone_handling': return '📱';
        case 'harsh_brake': return '🛑';
        case 'harsh_acceleration': return '⚡';
        case 'sharp_turn': return '↪️';
        case 'aggressive_steering': return '🔄';
        case 'excessive_movement': return '📳';
        default: return '⚠️';
      }
    };

    return (
      <View style={[styles.webContainer, { height }]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${svgHeight}`} style={{ overflow: 'visible' }}>
          {/* Grid lines for a modern telemetry radar look */}
          <Defs>
            <Pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <Path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#grid)" rx="12" />
          
          {/* Start and End nodes */}
          {route.length > 0 && (() => {
            const start = mapToSvg(route[0].latitude, route[0].longitude);
            const end = mapToSvg(route[route.length - 1].latitude, route[route.length - 1].longitude);
            return (
              <>
                <Circle cx={start.x} cy={start.y} r="6" fill="#10B981" />
                <Circle cx={end.x} cy={end.y} r="6" fill="#EF4444" />
                <SvgText x={start.x + 8} y={start.y + 4} fill="#10B981" fontSize="9" fontWeight="bold">START</SvgText>
                <SvgText x={end.x + 8} y={end.y + 4} fill="#EF4444" fontSize="9" fontWeight="bold">END</SvgText>
              </>
            );
          })()}

          {/* Drive route path */}
          <Path d={pathD} fill="none" stroke="#6366F1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <Path d={pathD} fill="none" stroke="#818CF8" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />

          {/* Event markers */}
          {events.map((evt) => {
            if (!evt.coordinate) return null;
            const { x, y } = mapToSvg(evt.coordinate.latitude, evt.coordinate.longitude);
            return (
              <G key={evt.id}>
                <Circle cx={x} cy={y} r="10" fill={getEventColor(evt.type)} opacity="0.2" />
                <Circle cx={x} cy={y} r="5" fill={getEventColor(evt.type)} />
                <SvgText x={x} y={y - 12} fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">
                  {getEventBadge(evt.type)}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </View>
    );
  }

  // Native map rendering using react-native-maps
  const startPoint = route[0];
  const endPoint = route[route.length - 1];

  // Calculate midpoints to center map
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;
  route.forEach(pt => {
    if (pt.latitude < minLat) minLat = pt.latitude;
    if (pt.latitude > maxLat) maxLat = pt.latitude;
    if (pt.longitude < minLon) minLon = pt.longitude;
    if (pt.longitude > maxLon) maxLon = pt.longitude;
  });

  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;
  const latDelta = Math.max(0.01, (maxLat - minLat) * 1.5);
  const lonDelta = Math.max(0.01, (maxLon - minLon) * 1.5);

  const getEventMarkerColor = (type: string) => {
    switch (type) {
      case 'phone_handling': return 'red';
      case 'harsh_brake': return 'orange';
      case 'harsh_acceleration': return 'wheat';
      case 'sharp_turn': return 'blue';
      case 'aggressive_steering': return 'purple';
      case 'excessive_movement': return 'green';
      default: return 'yellow';
    }
  };

  return (
    <View style={[styles.nativeContainer, { height }]}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: midLat,
          longitude: midLon,
          latitudeDelta: latDelta,
          longitudeDelta: lonDelta,
        }}
        userInterfaceStyle="dark"
      >
        {/* Route Line */}
        <Polyline
          coordinates={route}
          strokeColor="#6366F1"
          strokeWidth={4}
        />

        {/* Start Pin */}
        <Marker coordinate={startPoint} pinColor="green" title="Start Drive" />

        {/* End Pin */}
        <Marker coordinate={endPoint} pinColor="red" title="End Drive" />

        {/* Event Pins */}
        {events.map((evt) => {
          if (!evt.coordinate) return null;
          return (
            <Marker
              key={evt.id}
              coordinate={evt.coordinate}
              pinColor={getEventMarkerColor(evt.type)}
              title={evt.title}
              description={`Penalty: -${evt.penalty}`}
            />
          );
        })}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  nativeContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  webContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  fallbackContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    color: '#94A3B8',
    fontSize: 14,
  },
});
