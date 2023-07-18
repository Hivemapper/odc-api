import fetch from "node-fetch";

const HDC_DATA_LOGGER = "http://192.168.0.10:9001";

export async function getRawImuData(from: string, to: string) {
  const GET_RAW_IMU_DATA = `${HDC_DATA_LOGGER}/imu?from=${encodeURI(
    from,
  )}&to=${encodeURI(to)}`;
  console.log("calling endpoint: ", GET_RAW_IMU_DATA);
  try {
    const options = {
      headers: {
        'Content-Type': 'application/x-gzip',
      },
    };
    const resp = await fetch(GET_RAW_IMU_DATA, options);
    return resp.blob();
  } catch (error) {
    console.error('failed to fetch raw imu data', error);
  }
}
