package de.fhg.iais.roberta.ai;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.LongSupplier;

/**
 * the limits of the AI test assistant per session (an open page): one call of each kind at a time, and at most so many calls of each kind per hour.
 * They keep a stuck page or a curious learner from running up costs.
 */
final class AiLimits {
    private static final long HOUR_MS = 3600 * 1000L;

    private final Map<String, Integer> perHour;
    private final LongSupplier clock;
    private final Set<String> running = new HashSet<>();
    private final Map<String, Deque<Long>> calls = new HashMap<>();

    /**
     * @param perHour the most calls of a kind ("infer", "generate") per session and hour
     * @param clock the time in ms
     */
    AiLimits(Map<String, Integer> perHour, LongSupplier clock) {
        this.perHour = perHour;
        this.clock = clock;
    }

    /**
     * @return null if the call may be made (then call {@link #release} when it is done), "busy" if one of this kind still runs, "limit" if the hour's
     *     calls are used up
     */
    synchronized String acquire(long session, String kind) {
        String key = session + "/" + kind;
        if ( this.running.contains(key) ) {
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
        this.running.add(key);
        return null;
    }

    synchronized void release(long session, String kind) {
        this.running.remove(session + "/" + kind);
        long now = this.clock.getAsLong();
        this.calls.values().removeIf(times -> times.isEmpty() || times.peekLast() <= now - HOUR_MS);
    }
}
