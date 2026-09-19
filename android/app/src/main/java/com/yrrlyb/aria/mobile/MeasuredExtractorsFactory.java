package com.yrrlyb.aria.mobile;

import android.net.Uri;
import androidx.media3.common.C;
import androidx.media3.common.DataReader;
import androidx.media3.common.Format;
import androidx.media3.common.util.ParsableByteArray;
import androidx.media3.extractor.*;
import java.io.IOException;
import java.util.List;
import java.util.Map;

/** Observes demuxed audio samples while forwarding all bytes unchanged to Media3. */
final class MeasuredExtractorsFactory implements ExtractorsFactory {
    private final DefaultExtractorsFactory delegate = new DefaultExtractorsFactory();
    private final AudioBitrateMeter meter;
    MeasuredExtractorsFactory(AudioBitrateMeter meter) { this.meter = meter; }
    @Override public Extractor[] createExtractors() { return wrap(delegate.createExtractors()); }
    @Override public Extractor[] createExtractors(Uri uri, Map<String, List<String>> headers) {
        return wrap(delegate.createExtractors(uri, headers));
    }
    private Extractor[] wrap(Extractor[] extractors) {
        for (int i = 0; i < extractors.length; i++) extractors[i] = new MeasuredExtractor(extractors[i]);
        return extractors;
    }
    private class MeasuredExtractor implements Extractor {
        private final Extractor extractor;
        MeasuredExtractor(Extractor extractor) { this.extractor = extractor; }
        @Override public boolean sniff(ExtractorInput input) throws IOException { return extractor.sniff(input); }
        @Override public int read(ExtractorInput input, PositionHolder seek) throws IOException { return extractor.read(input, seek); }
        @Override public void seek(long position, long timeUs) { meter.reset(); extractor.seek(position, timeUs); }
        @Override public void release() { extractor.release(); }
        @Override public Extractor getUnderlyingImplementation() { return extractor.getUnderlyingImplementation(); }
        @Override public void init(ExtractorOutput output) {
            extractor.init(new ExtractorOutput() {
                @Override public void endTracks() { output.endTracks(); }
                @Override public void seekMap(SeekMap map) { output.seekMap(map); }
                @Override public TrackOutput track(int id, int type) {
                    TrackOutput track = output.track(id, type);
                    if (type != C.TRACK_TYPE_AUDIO) return track;
                    return new TrackOutput() {
                        @Override public void format(Format format) { track.format(format); }
                        @Override public int sampleData(DataReader input, int length, boolean allowEnd, int part) throws IOException {
                            return track.sampleData(input, length, allowEnd, part);
                        }
                        @Override public void sampleData(ParsableByteArray data, int length, int part) { track.sampleData(data, length, part); }
                        @Override public void sampleMetadata(long timeUs, int flags, int size, int offset, CryptoData crypto) {
                            meter.sample(timeUs, size);
                            track.sampleMetadata(timeUs, flags, size, offset, crypto);
                        }
                    };
                }
            });
        }
    }
}
