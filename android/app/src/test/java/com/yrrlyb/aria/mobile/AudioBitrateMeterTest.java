package com.yrrlyb.aria.mobile;

import org.junit.Test;
import static org.junit.Assert.*;

public class AudioBitrateMeterTest {
    @Test public void measuresEncodedBytesAgainstMediaTime() {
        AudioBitrateMeter meter = new AudioBitrateMeter();
        for (int i = 0; i <= 100; i++) meter.sample(i * 20_000L, 800);
        assertEquals(320_000, meter.bitrateAt(1000));
    }
    @Test public void followsPlayheadInsteadOfReadAhead() {
        AudioBitrateMeter meter = new AudioBitrateMeter();
        for (int i = 0; i <= 1000; i++) meter.sample(i * 20_000L, i < 500 ? 400 : 2400);
        assertEquals(160_000, meter.bitrateAt(4000));
        assertEquals(960_000, meter.bitrateAt(14000));
    }
    @Test public void clearsOnSeekAndDoesNotBridgeDiscontinuities() {
        AudioBitrateMeter meter = new AudioBitrateMeter();
        meter.sample(0, 800); meter.sample(20_000, 800);
        assertEquals(0, meter.bitrateAt(0));
        meter.sample(30_000_000, 800);
        assertEquals(0, meter.bitrateAt(30000));
        for (int i = 1; i <= 10; i++) meter.sample(30_000_000 + i * 20_000L, 800);
        assertEquals(320_000, meter.bitrateAt(30000));
        meter.reset(); assertEquals(0, meter.bitrateAt(30000));
    }
    @Test public void splitsFramesAcrossSecondBoundaries() {
        AudioBitrateMeter meter = new AudioBitrateMeter();
        for (int i = 0; i <= 40; i++) meter.sample(995_000 + i * 20_000L, 1000);
        assertEquals(400_000, meter.bitrateAt(1000));
    }
}
