export class KalmanFilter {
  private R: number; // noise power desirable
  private Q: number; // noise power estimated
  private A: number;
  private B: number;
  private C: number;
  private cov: number;
  private x: number; // estimated signal without noise

  constructor(R: number, Q: number, A: number, B: number, C: number) {
    this.R = R;
    this.Q = Q;
    this.A = A;
    this.B = B;
    this.C = C;
    this.cov = NaN;
    this.x = NaN;
  }

  filter(z: number, u = 0): number {
    if (isNaN(this.x)) {
      this.x = (1 / this.C) * z;
      this.cov = (1 / this.C) * this.Q * (1 / this.C);
    } else {
      // Compute prediction
      const predX = this.predict(u);
      const predCov = this.uncertainty();

      // Kalman gain
      const K = predCov * this.C * (1 / (this.C * predCov * this.C + this.Q));

      // Correction
      this.x = predX + K * (z - this.C * predX);
      this.cov = predCov - K * this.C * predCov;
    }

    return this.x;
  }

  predict(u = 0): number {
    return this.A * this.x + this.B * u;
  }

  uncertainty(): number {
    return this.A * this.cov * this.A + this.R;
  }

  lastMeasurement(): number {
    return this.x;
  }

  setMeasurementNoise(noise: number): void {
    this.Q = noise;
  }

  setProcessNoise(noise: number): void {
    this.R = noise;
  }
}
