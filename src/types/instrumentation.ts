export type DopKpi = {
  min: number;
  max: number;
  median: number;
  mean: number;
  sum: number;
  count: number;
};

export type GnssDopKpi = {
  xdop: DopKpi;
  ydop: DopKpi;
  pdop: DopKpi;
  hdop: DopKpi;
  vdop: DopKpi;
  tdop: DopKpi;
  gdop: DopKpi;
  eph: DopKpi;
};
