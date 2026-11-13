import math


def rh_to_abs_humidity(temp, rh):
    saturation_vapour_pressure = 6.112 * math.exp((17.67 * temp) / (temp + 243.5))
    actual_vapour_pressure = saturation_vapour_pressure * (rh/100.0)

    return (actual_vapour_pressure * 216.7) / (temp + 273.15)
