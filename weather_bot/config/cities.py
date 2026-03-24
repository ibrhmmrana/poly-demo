"""City definitions for weather markets.

Each city specifies:
  - lat/lon for forecast API lookups
  - The airport station code used by Wunderground for resolution
  - temp_unit: "F" (Fahrenheit) or "C" (Celsius) matching Polymarket brackets
  - forecast_source: "nws" (US) or "openmeteo" (international)
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class City:
    name: str
    slug: str  # lowercase, used to match Polymarket market titles
    lat: float
    lon: float
    station: str  # ICAO code for Wunderground resolution
    temp_unit: str  # "F" or "C"
    forecast_source: str  # "nws" or "openmeteo"
    bracket_size: int = 2  # degrees per bracket (NYC uses 2°F ranges)


CITIES: dict[str, City] = {
    "nyc": City(
        name="New York City",
        slug="nyc",
        lat=40.7769,
        lon=-73.8740,
        station="KLGA",
        temp_unit="F",
        forecast_source="nws",
    ),
    "chicago": City(
        name="Chicago",
        slug="chicago",
        lat=41.9742,
        lon=-87.9073,
        station="KORD",
        temp_unit="F",
        forecast_source="nws",
    ),
    "dallas": City(
        name="Dallas",
        slug="dallas",
        lat=32.8471,
        lon=-96.8518,
        station="KDAL",
        temp_unit="F",
        forecast_source="nws",
    ),
    "miami": City(
        name="Miami",
        slug="miami",
        lat=25.7959,
        lon=-80.2870,
        station="KMIA",
        temp_unit="F",
        forecast_source="nws",
    ),
    "seattle": City(
        name="Seattle",
        slug="seattle",
        lat=47.4502,
        lon=-122.3088,
        station="KSEA",
        temp_unit="F",
        forecast_source="nws",
    ),
    "atlanta": City(
        name="Atlanta",
        slug="atlanta",
        lat=33.6407,
        lon=-84.4277,
        station="KATL",
        temp_unit="F",
        forecast_source="nws",
    ),
    "london": City(
        name="London",
        slug="london",
        lat=51.5054,
        lon=0.0554,
        station="EGLC",
        temp_unit="C",
        forecast_source="openmeteo",
        bracket_size=1,
    ),
    "lucknow": City(
        name="Lucknow",
        slug="lucknow",
        lat=26.8467,
        lon=80.9462,
        station="VILK",
        temp_unit="C",
        forecast_source="openmeteo",
        bracket_size=1,
    ),
    "seoul": City(
        name="Seoul",
        slug="seoul",
        lat=37.5665,
        lon=126.9780,
        station="RKSS",
        temp_unit="C",
        forecast_source="openmeteo",
        bracket_size=1,
    ),
    "warsaw": City(
        name="Warsaw",
        slug="warsaw",
        lat=52.1657,
        lon=20.9671,
        station="EPWA",
        temp_unit="C",
        forecast_source="openmeteo",
        bracket_size=1,
    ),
    "shanghai": City(
        name="Shanghai",
        slug="shanghai",
        lat=31.2304,
        lon=121.4737,
        station="ZSSS",
        temp_unit="C",
        forecast_source="openmeteo",
        bracket_size=1,
    ),
}
