package de.fhg.iais.roberta.ai;

import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;
import java.util.function.LongSupplier;

/**
 * the limits of the AI test assistant per session (an open page): so many calls of each kind at a time (one, but generate runs one call per
 * scenario in parallel), and at most so many calls of each kind per hour. They keep a stuck page or a curious learner from running up costs.
 */
final class AiLimits {
    private static final long HOUR_MS = 3600 * 1000L;

    private final Map<String, Integer> perHour;
    private final Map<String, Integer> atOnce;
    private final LongSupplier clock;
    private final Map<String, Integer> running = new HashMap<>();
    private final Map<String, Deque<Long>> calls = new HashMap<>();

    /**
     * @param perHour the most calls of a kind ("infer", "generate") per session and hour
     * @param clock the time in ms
     */
    AiLimits(Map<String, Integer> perHour, LongSupplier clock) {
        this(perHour, Collections.emptyMap(), clock);
    }

    /**
     * @param perHour the most calls of a kind ("infer", "generate") per session and hour
     * @param atOnce the most calls of a kind that may run at the same time per session (missing: 1)
     * @param clock the time in ms
     */
    AiLimits(Map<String, Integer> perHour, Map<String, Integer> atOnce, LongSupplier clock) {
        this.perHour = perHour;
        this.atOnce = atOnce;
        this.clock = clock;
    }

    /**
     * @return null if the call may be made (then call {@link #release} when it is done), "busy" if as many of this kind as may run at once still
     *     run, "limit" if the hour's calls are used up
     */
    synchronized String acquire(long session, String kind) {
        String key = session + "/" + kind;
        if ( this.running.getOrDefault(key, 0) >= this.atOnce.getOrDefault(kind, 1) ) {
            return "busy";
        }
        long now = this.clock.getAsLong();
        Deque<Long> times = this.calls.computeIfAbsent(key, k -> new ArrayDeque<>());
        while ( !times.isEmpty() && times.peekFirst() <= now - HOUR_MS ) {
            times.removeFirst();
        }
        if ( times.size() >= this.perHour.getOrDefault(kind, 0) ) {
            return "limit";
        }
        times.addLast(now);
        this.running.merge(key, 1, Integer::sum);
        return null;
    }

    synchronized void release(long session, String kind) {
        String key = session + "/" + kind;
        this.running.computeIfPresent(key, (k, n) -> n > 1 ? n - 1 : null);
        long now = this.clock.getAsLong();
        this.calls.values().removeIf(times -> times.isEmpty() || times.peekLast() <= now - HOUR_MS);
    }
}
