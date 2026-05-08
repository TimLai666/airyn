package engine

import "math"

// earthRadiusM is the IUGG mean radius. Plenty accurate for waypoint distance
// at quad-flight scales.
const earthRadiusM = 6371008.8

// HaversineMeters returns the great-circle distance between two WGS84
// coordinates, in meters.
func HaversineMeters(lat1, lon1, lat2, lon2 float64) float64 {
	rlat1 := lat1 * math.Pi / 180
	rlat2 := lat2 * math.Pi / 180
	dlat := (lat2 - lat1) * math.Pi / 180
	dlon := (lon2 - lon1) * math.Pi / 180

	a := math.Sin(dlat/2)*math.Sin(dlat/2) +
		math.Cos(rlat1)*math.Cos(rlat2)*math.Sin(dlon/2)*math.Sin(dlon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return earthRadiusM * c
}

// BearingDeg returns the initial true bearing from (lat1,lon1) to (lat2,lon2)
// in degrees, normalised to [0,360).
func BearingDeg(lat1, lon1, lat2, lon2 float64) float64 {
	rlat1 := lat1 * math.Pi / 180
	rlat2 := lat2 * math.Pi / 180
	dlon := (lon2 - lon1) * math.Pi / 180
	y := math.Sin(dlon) * math.Cos(rlat2)
	x := math.Cos(rlat1)*math.Sin(rlat2) - math.Sin(rlat1)*math.Cos(rlat2)*math.Cos(dlon)
	deg := math.Atan2(y, x) * 180 / math.Pi
	deg = math.Mod(deg+360, 360)
	return deg
}
