package com.yrrlyb.aria.mobile;

import java.util.TreeMap;

/** Encoded audio bytes / media time, in one-second bins. No network clock or API metadata. */
final class AudioBitrateMeter {
    private final TreeMap<Long, double[]> bins = new TreeMap<>();
    private long previousUs = -1;
    private int previousSize;

    synchronized void reset() { bins.clear(); previousUs = -1; previousSize = 0; }

    synchronized void sample(long timeUs, int bytes) {
        if (timeUs < 0 || bytes <= 0) return;
        if (previousUs >= 0 && timeUs > previousUs && timeUs - previousUs < 1_000_000) {
            long duration = timeUs - previousUs;
            long cursor = previousUs;
            while (cursor < timeUs) {
                long second = cursor / 1_000_000;
                long end = Math.min(timeUs, (second + 1) * 1_000_000);
                double[] bin = bins.computeIfAbsent(second, ignored -> new double[2]);
                bin[0] += previousSize * 8.0 * (end - cursor) / duration;
                bin[1] += end - cursor;
                cursor = end;
            }
            // Bounded even for long podcasts; decoder read-ahead is normally seconds.
            while (bins.size() > 7200) bins.pollFirstEntry();
        }
        previousUs = timeUs;
        previousSize = bytes;
    }

    synchronized long bitrateAt(long positionMs) {
        long second = Math.max(0, positionMs / 1000);
        double bits = 0, micros = 0;
        for (double[] bin : bins.subMap(Math.max(0, second - 1), true, second + 1, true).values()) {
            bits += bin[0]; micros += bin[1];
        }
        return micros >= 100_000 ? Math.round(bits * 1_000_000 / micros) : 0;
    }
}
