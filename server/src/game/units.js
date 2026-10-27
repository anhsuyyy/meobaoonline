function metersToPixels(meters, pixelsPerMeter) {
    return meters * pixelsPerMeter;
}

function pixelsToMeters(pixels, pixelsPerMeter) {
    return pixels / pixelsPerMeter;
}

module.exports = { metersToPixels, pixelsToMeters };
