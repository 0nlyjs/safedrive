import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight } from 'expo-symbols';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

// Map SF Symbols to MaterialIcons names for cross-platform compatibility (iOS vs Android/Web)
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'xmark': 'close',
  'clock.fill': 'access-time',
  'location.fill': 'location-on',
  'gauge.with.needle.fill': 'speed',
  'sparkles': 'assistant',
  'phone.fill': 'phone-android',
  'exclamationmark.triangle.fill': 'warning',
  'bolt.fill': 'flash-on',
  'arrow.turn.up.right': 'navigation',
  'arrow.triangle.2.circlepath': 'loop',
  'hand.point.up.braille.fill': 'vibration',
  'bell.fill': 'notifications',
  'play.desktopcomputer': 'computer',
  'iphone': 'phone-android',
  'car.fill': 'directions-car',
  'arrow.right': 'arrow-forward',
  'map.fill': 'map',
  'trash': 'delete',
  'checkmark.circle.fill': 'check-circle',
  'exclamationmark.circle.fill': 'error',
} as const;

export type IconSymbolName = keyof typeof MAPPING;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
