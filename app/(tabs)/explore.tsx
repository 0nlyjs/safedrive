import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDrivingSession, DriveSession } from '@/hooks/use-driving-session';
import { DriveSummary } from '@/components/drive-summary';
import { IconSymbol } from '@/components/ui/icon-symbol';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

export default function HistoryScreen() {
  const { history, clearHistory, deleteSession } = useDrivingSession();
  const [selectedSession, setSelectedSession] = useState<DriveSession | null>(null);
  const [isSummaryVisible, setIsSummaryVisible] = useState(false);

  // Format Duration (HH:MM:SS or MM:SS)
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hrs > 0
      ? `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 90) return '#10B981'; // Green
    if (score >= 80) return '#3B82F6'; // Blue
    if (score >= 70) return '#F59E0B'; // Amber
    return '#EF4444'; // Red
  };

  // Prompt to clear history
  const handleClearHistory = () => {
    if (Platform.OS === 'web') {
      const confirmClear = window.confirm('Are you sure you want to clear all drive history? This cannot be undone.');
      if (confirmClear) clearHistory();
    } else {
      Alert.alert(
        'Clear History',
        'Are you sure you want to delete all past drive sessions? This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete All', style: 'destructive', onPress: clearHistory },
        ]
      );
    }
  };

  // Prompt to delete a specific session
  const handleDeleteSession = (id: string) => {
    if (Platform.OS === 'web') {
      const confirmDelete = window.confirm('Delete this drive session?');
      if (confirmDelete) deleteSession(id);
    } else {
      Alert.alert(
        'Delete Session',
        'Do you want to delete this drive session from your log?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteSession(id) },
        ]
      );
    }
  };

  // Draw Score Trend Line using Svg (uses last 8 sessions chronologically)
  const renderTrendChart = () => {
    if (history.length < 2) return null;

    // Take up to last 8 items and reverse them so they appear oldest to newest
    const chartData = [...history.slice(0, 8)].reverse();
    const width = 300;
    const height = 110;
    const paddingX = 20;
    const paddingY = 15;

    const chartWidth = width - 2 * paddingX;
    const chartHeight = height - 2 * paddingY;

    // Map index and score to SVG canvas coords
    const getCoords = (idx: number, score: number) => {
      const x = paddingX + (idx / (chartData.length - 1)) * chartWidth;
      // Score ranges 0 to 100
      const y = height - paddingY - (score / 100) * chartHeight;
      return { x, y };
    };

    const points = chartData.map((d, i) => getCoords(i, d.score));
    
    // Construct line path
    const pathD = `M ${points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;
    
    // Construct shaded fill path that goes down to the base axis
    const fillD = `${pathD} L ${points[points.length - 1].x.toFixed(1)},${(height - paddingY).toFixed(1)} L ${points[0].x.toFixed(1)},${(height - paddingY).toFixed(1)} Z`;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Score Progression Trend</Text>
        <View style={styles.svgWrapper}>
          <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
            <Defs>
              <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#6366F1" stopOpacity="0.4" />
                <Stop offset="100%" stopColor="#6366F1" stopOpacity="0.0" />
              </LinearGradient>
            </Defs>
            
            {/* Grid Line Baselines (50 and 100 score marks) */}
            <Path
              d={`M ${paddingX} ${height - paddingY - 0.5 * chartHeight} L ${width - paddingX} ${height - paddingY - 0.5 * chartHeight}`}
              stroke="rgba(255, 255, 255, 0.05)"
              strokeWidth="1"
              strokeDasharray="4,4"
            />
            <Path
              d={`M ${paddingX} ${height - paddingY - chartHeight} L ${width - paddingX} ${height - paddingY - chartHeight}`}
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="1"
            />
            
            {/* Shaded Area Under Line */}
            <Path d={fillD} fill="url(#chartGradient)" />

            {/* Line Path */}
            <Path d={pathD} fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" />

            {/* Circles at data nodes */}
            {points.map((p, i) => (
              <Circle
                key={chartData[i].id}
                cx={p.x}
                cy={p.y}
                r="4"
                fill="#FFFFFF"
                stroke={getScoreColor(chartData[i].score)}
                strokeWidth="2.5"
              />
            ))}
          </Svg>
        </View>
        <View style={styles.chartAxisRow}>
          <Text style={styles.chartAxisText}>Oldest</Text>
          <Text style={styles.chartAxisText}>Score Trend ({chartData.length} Drives)</Text>
          <Text style={styles.chartAxisText}>Latest</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#090D1A' }]}>
      {/* Background Ambient Glows */}
      <View style={styles.bgGlowTop} pointerEvents="none" />
      <View style={styles.bgGlowBottom} pointerEvents="none" />

      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Drive History & Trends</Text>
          <Text style={styles.headerSubtitle}>Analyze your performance over time</Text>
        </View>
        {history.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearHistory}>
            <IconSymbol size={16} name="trash" color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* SCORE TREND GRAPH */}
        {renderTrendChart()}

        {/* DRIVE LIST */}
        <Text style={styles.sectionHeader}>Log Logs ({history.length})</Text>

        {history.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBg}>
              <IconSymbol size={48} name="car.fill" color="#475569" />
            </View>
            <Text style={styles.emptyTitle}>No Driving Logs Yet</Text>
            <Text style={styles.emptySubtitle}>
              Completed sessions longer than 3 seconds will automatically save here with full maps, scorecards, and safety feedback.
            </Text>
          </View>
        ) : (
          <View style={styles.historyList}>
            {history.map((item) => {
              const cardColor = getScoreColor(item.score);
              const glassStyle = {
                backgroundColor: `${cardColor}06`, // very faint tint for glass background
                borderColor: `${cardColor}40`,     // glow border
                borderWidth: 1.5,
              };

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.historyCard, glassStyle]}
                  onPress={() => {
                    setSelectedSession(item);
                    setIsSummaryVisible(true);
                  }}
                  onLongPress={() => handleDeleteSession(item.id)}
                >
                  {/* Score badge */}
                  <View
                    style={[
                      styles.scoreBadge,
                      {
                        borderColor: cardColor,
                        backgroundColor: cardColor + '15',
                      },
                    ]}
                  >
                    <Text style={[styles.scoreVal, { color: cardColor }]}>
                      {item.score}
                    </Text>
                    <Text style={[styles.scoreLbl, { color: cardColor }]}>score</Text>
                  </View>

                  {/* Info summary */}
                  <View style={styles.cardInfo}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.ratingText}>{item.rating} Rating</Text>
                      <Text style={styles.dateText}>
                        {new Date(item.endTime).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                    <View style={styles.cardMetricsRow}>
                      <Text style={styles.metricText}>
                        ⏱️ {formatDuration(item.duration)}
                      </Text>
                      <Text style={styles.metricText}>
                        📍 {(item.distance / 1000).toFixed(2)} km
                      </Text>
                      <Text style={styles.metricText}>
                        🛑 {item.events.length} event{item.events.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Chevron */}
                  <IconSymbol size={16} name="chevron.right" color="#475569" />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* DETAILED SUMMARY MODAL */}
      <Modal visible={isSummaryVisible} animationType="slide" presentationStyle="fullScreen">
        {selectedSession && (
          <DriveSummary
            session={selectedSession}
            onClose={() => {
              setIsSummaryVisible(false);
              setSelectedSession(null);
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
    position: 'relative',
    overflow: 'hidden',
  },
  bgGlowTop: {
    position: 'absolute',
    top: -120,
    right: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(99, 102, 241, 0.15)', // Indigo glow
    opacity: 0.8,
    zIndex: 0,
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -150,
    left: -150,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(168, 85, 247, 0.12)', // Purple glow
    opacity: 0.7,
    zIndex: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  scrollContent: {
    padding: 20,
  },
  chartContainer: {
    backgroundColor: 'rgba(139, 92, 246, 0.06)', // Purple glass
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(139, 92, 246, 0.25)',
    marginBottom: 25,
  },
  chartTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  svgWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  chartAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  chartAxisText: {
    fontSize: 9,
    color: '#475569',
    fontWeight: 'bold',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    paddingLeft: 4,
  },
  emptyContainer: {
    backgroundColor: 'rgba(30, 41, 59, 0.2)',
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 40,
    alignItems: 'center',
    marginTop: 10,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E2E8F0',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
    textAlign: 'center',
  },
  historyList: {
    gap: 12,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
  },
  scoreBadge: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  scoreVal: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  scoreLbl: {
    fontSize: 7,
    textTransform: 'uppercase',
    fontWeight: 'bold',
    marginTop: -2,
  },
  cardInfo: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  dateText: {
    fontSize: 11,
    color: '#64748B',
  },
  cardMetricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  metricText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  bottomSpacer: {
    height: 80,
  },
});
