import React from 'react';
import { StyleSheet, Text, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DriveSession, EVENT_TITLES, EVENT_PENALTIES, EventType } from '@/hooks/use-driving-session';
import { RouteMap } from './route-map';
import { IconSymbol } from './ui/icon-symbol';

interface DriveSummaryProps {
  session: DriveSession;
  onClose: () => void;
}

export const DriveSummary: React.FC<DriveSummaryProps> = ({ session, onClose }) => {
  // Duration formatter (HH:MM:SS or MM:SS)
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

  // Event icon helper
  const getEventIcon = (type: EventType) => {
    switch (type) {
      case 'phone_handling': return 'phone.fill';
      case 'harsh_brake': return 'exclamationmark.triangle.fill';
      case 'harsh_acceleration': return 'bolt.fill';
      case 'sharp_turn': return 'arrow.turn.up.right';
      case 'aggressive_steering': return 'arrow.triangle.2.circlepath';
      case 'excessive_movement': return 'hand.point.up.braille.fill';
      default: return 'bell.fill';
    }
  };

  // Event breakdown counts
  const eventCounts = session.events.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {} as Record<EventType, number>);

  const scoreColor = getScoreColor(session.score);
  const glassScoreCard = {
    backgroundColor: `${scoreColor}06`,
    borderColor: `${scoreColor}40`,
    borderWidth: 1.5,
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#090D1A' }]}>
      {/* Background Ambient Glows */}
      <View style={styles.bgGlowTop} pointerEvents="none" />
      <View style={styles.bgGlowBottom} pointerEvents="none" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Drive Session Summary</Text>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <IconSymbol size={22} name="xmark" color="#94A3B8" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Score & Rating Glassmorphic Card */}
        <View style={[styles.scoreCard, glassScoreCard]}>
          <View style={styles.scoreCircleContainer}>
            <View style={[styles.scoreCircle, { borderColor: getScoreColor(session.score) }]}>
              <Text style={styles.scoreText}>{session.score}</Text>
              <Text style={styles.scoreLabel}>Score</Text>
            </View>
          </View>
          <View style={styles.ratingInfo}>
            <Text style={styles.ratingTitle}>Safety Rating</Text>
            <Text style={[styles.ratingValue, { color: getScoreColor(session.score) }]}>
              {session.rating}
            </Text>
            <Text style={styles.dateText}>
              {new Date(session.endTime).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <IconSymbol size={20} name="clock.fill" color="#94A3B8" />
            <Text style={styles.statVal}>{formatDuration(session.duration)}</Text>
            <Text style={styles.statLbl}>Duration</Text>
          </View>
          <View style={styles.statBox}>
            <IconSymbol size={20} name="location.fill" color="#94A3B8" />
            <Text style={styles.statVal}>
              {(session.distance / 1000).toFixed(2)} km
            </Text>
            <Text style={styles.statLbl}>Distance</Text>
          </View>
          <View style={styles.statBox}>
            <IconSymbol size={20} name="gauge.with.needle.fill" color="#94A3B8" />
            <Text style={styles.statVal}>{session.averageSpeed} km/h</Text>
            <Text style={styles.statLbl}>Avg Speed</Text>
          </View>
        </View>

        {/* Route Replay Map */}
        <Text style={styles.sectionTitle}>Route Replay</Text>
        <RouteMap route={session.route} events={session.events} height={220} />

        {/* Coach Feedback Section */}
        <View style={styles.coachCard}>
          <View style={styles.coachHeader}>
            <IconSymbol size={20} name="sparkles" color="#A855F7" />
            <Text style={styles.coachTitle}>AI Driving Coach</Text>
          </View>
          <Text style={styles.coachFeedback}>{session.feedback}</Text>
        </View>

        {/* Event Breakdown */}
        <Text style={styles.sectionTitle}>Event Breakdown</Text>
        <View style={styles.breakdownCard}>
          {session.events.length === 0 ? (
            <Text style={styles.emptyText}>🎉 No driving errors detected. Exceptional job!</Text>
          ) : (
            Object.keys(EVENT_PENALTIES).map((key) => {
              const type = key as EventType;
              const count = eventCounts[type] || 0;
              if (count === 0) return null;

              return (
                <View key={type} style={styles.breakdownItem}>
                  <View style={styles.breakdownLabelGroup}>
                    <View style={[styles.miniIconBg, { backgroundColor: getScoreColor(100 - EVENT_PENALTIES[type] * 3) }]}>
                      <IconSymbol size={14} name={getEventIcon(type)} color="#FFFFFF" />
                    </View>
                    <Text style={styles.breakdownName}>{EVENT_TITLES[type]}</Text>
                  </View>
                  <View style={styles.breakdownValueGroup}>
                    <Text style={styles.breakdownCount}>x{count}</Text>
                    <Text style={styles.breakdownPenalty}>-{count * EVENT_PENALTIES[type]} pts</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Event Timeline (History details) */}
        {session.events.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Event Timeline</Text>
            <View style={styles.timelineCard}>
              {session.events.map((evt, idx) => {
                const elapsedSecs = Math.round((evt.timestamp - session.startTime) / 1000);
                return (
                  <View key={evt.id} style={styles.timelineItem}>
                    <View style={styles.timelineIndicator}>
                      <View style={[styles.timelineDot, { backgroundColor: getScoreColor(100 - evt.penalty * 5) }]} />
                      {idx < session.events.length - 1 && <View style={styles.timelineLine} />}
                    </View>
                    <View style={styles.timelineContent}>
                      <View style={styles.timelineHeader}>
                        <Text style={styles.timelineName}>{evt.title}</Text>
                        <Text style={styles.timelineTime}>{formatDuration(elapsedSecs)}</Text>
                      </View>
                      <Text style={styles.timelineDetail}>
                        Penalty: -{evt.penalty} pts | Magnitude: {evt.magnitude.toFixed(2)} {evt.type.includes('turn') || evt.type.includes('steering') || evt.type.includes('handling') ? 'rad/s' : 'm/s²'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Done Button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.doneButton} onPress={onClose}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D1A',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 20,
  },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  scoreCircleContainer: {
    marginRight: 20,
  },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  scoreText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#F8FAFC',
  },
  scoreLabel: {
    fontSize: 9,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    marginTop: -2,
  },
  ratingInfo: {
    flex: 1,
  },
  ratingTitle: {
    fontSize: 12,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  ratingValue: {
    fontSize: 22,
    fontWeight: 'bold',
    marginVertical: 2,
  },
  dateText: {
    fontSize: 12,
    color: '#64748B',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(99, 102, 241, 0.06)',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(99, 102, 241, 0.25)',
  },
  statVal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginTop: 6,
  },
  statLbl: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginTop: 20,
    marginBottom: 10,
    paddingLeft: 4,
  },
  coachCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.06)', // Purple glass
    borderColor: 'rgba(139, 92, 246, 0.25)',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 18,
    marginTop: 20,
  },
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  coachTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#C084FC',
  },
  coachFeedback: {
    fontSize: 13,
    lineHeight: 20,
    color: '#DDD6FE',
  },
  breakdownCard: {
    backgroundColor: 'rgba(20, 184, 166, 0.06)', // Teal glass
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(20, 184, 166, 0.25)',
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  breakdownLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  miniIconBg: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breakdownName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#E2E8F0',
  },
  breakdownValueGroup: {
    alignItems: 'flex-end',
  },
  breakdownCount: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  breakdownPenalty: {
    fontSize: 10,
    color: '#EF4444',
  },
  emptyText: {
    color: '#10B981',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
    fontWeight: '500',
  },
  timelineCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.06)', // Amber glass
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 55,
  },
  timelineIndicator: {
    alignItems: 'center',
    marginRight: 12,
    width: 14,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 12,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#E2E8F0',
  },
  timelineTime: {
    fontSize: 11,
    color: '#64748B',
  },
  timelineDetail: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  bottomSpacer: {
    height: 80,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  doneButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
