import { GnssRecord, ImuRecord } from 'types/sqlite';
import { LowPassFilter } from 'util/filters';

// Filter constants
const RAW_SIGNAL_CUTOFF_FREQUENCY = 0.9; // 0.25
const DIFF_CUTOFF_FREQUENCY = 0.035; //0.05
// Constants for GNSS Stationary Rejection
const HDOP_THRESHOLD = 3;
const SPEED_THRESHOLD = 2;
// Constants for stationary detection
const WINDOW_SIZE_MS = 1000;
const ACC_THRESHOLD = 0.25;
const GYRO_THRESHOLD = 0.25;


/**
 * Detects stationary points based on IMU data.
 * Uses GNSS data to reject points that GNSS deems not stationary.
 * 
 * @param gnssData The GNSS data to use for stationary detection.
 * @param imuData The IMU data to use for stationary detection.
 * @returns An array of booleans indicating whether each data point is stationary.
 * Value meaning -> True: stationary, False: not stationary
 * Array length is the same as the input GNSS array
 */
export function imuBasedStationaryDetection(gnssData: GnssRecord[], imuData: ImuRecord[])  {
    // Check that imu time starts before gnss time (needed for interpolation)
    if (imuData[0].system_time > gnssData[0].system_time) {
        gnssData.shift();
    }
    // extract out all sensor data into individual arrays
    let acc_x: number[] = [];
    let acc_y: number[] = [];
    let acc_z: number[] = [];
    let gyro_x: number[] = [];
    let gyro_y: number[] = [];
    let gyro_z: number[] = [];
    let imuTime: number[] = [];
    for (const imuRecord of imuData) {
        acc_x.push(imuRecord.acc_x);
        acc_y.push(imuRecord.acc_y);
        acc_z.push(imuRecord.acc_z);
        gyro_x.push(imuRecord.gyro_x);
        gyro_y.push(imuRecord.gyro_y);
        gyro_z.push(imuRecord.gyro_z);
        imuTime.push(imuRecord.system_time);
    }
    let gnssTime: number[] = [];
    let hdop: number[] = [];
    let gnssSpeed: number[] = [];
    for (const gnssRecord of gnssData) {
        gnssTime.push(gnssRecord.system_time);
        hdop.push(gnssRecord.hdop);
        gnssSpeed.push(gnssRecord.speed);
    }
    const imuFreq = calculateAverageFrequency(imuTime);
    const gnssFreq = calculateAverageFrequency(gnssTime);

    // Figure out how to bring in butterworth low pass filter here, filter all sensor arrays
    const lowPassFilter = new LowPassFilter(RAW_SIGNAL_CUTOFF_FREQUENCY, imuFreq);
    acc_x = lowPassFilter.filter(acc_x);
    acc_y = lowPassFilter.filter(acc_y);
    acc_z = lowPassFilter.filter(acc_z);
    gyro_x = lowPassFilter.filter(gyro_x);
    gyro_y = lowPassFilter.filter(gyro_y);
    gyro_z = lowPassFilter.filter(gyro_z);

    // Next interpolation to match the time of the GNSS data
    acc_x = linearInterpolation(imuTime, acc_x, gnssTime);
    acc_y = linearInterpolation(imuTime, acc_y, gnssTime);
    acc_z = linearInterpolation(imuTime, acc_z, gnssTime);
    gyro_x = linearInterpolation(imuTime, gyro_x, gnssTime);
    gyro_y = linearInterpolation(imuTime, gyro_y, gnssTime);
    gyro_z = linearInterpolation(imuTime, gyro_z, gnssTime);

    // Calculate diffs for each axis of the accelerometer and gyroscope
    const acc_x_diff = calculatePaddedDiff(acc_x);
    const acc_y_diff = calculatePaddedDiff(acc_y);
    const acc_z_diff = calculatePaddedDiff(acc_z);
    const gyro_x_diff = calculatePaddedDiff(gyro_x);
    const gyro_y_diff = calculatePaddedDiff(gyro_y);
    const gyro_z_diff = calculatePaddedDiff(gyro_z);
    // Take the absolute value of the differences
    let acc_x_diff_abs = takeAbsoluteValue(acc_x_diff);
    let acc_y_diff_abs = takeAbsoluteValue(acc_y_diff);
    let acc_z_diff_abs = takeAbsoluteValue(acc_z_diff);
    let gyro_x_diff_abs = takeAbsoluteValue(gyro_x_diff);
    let gyro_y_diff_abs = takeAbsoluteValue(gyro_y_diff);
    let gyro_z_diff_abs = takeAbsoluteValue(gyro_z_diff);
    // Pass through a butterworth low pass filter again
    const lowPassFilter2 = new LowPassFilter(DIFF_CUTOFF_FREQUENCY, imuFreq);
    acc_x_diff_abs = lowPassFilter2.filter(acc_x_diff_abs);
    acc_y_diff_abs = lowPassFilter2.filter(acc_y_diff_abs);
    acc_z_diff_abs = lowPassFilter2.filter(acc_z_diff_abs);
    gyro_x_diff_abs = lowPassFilter2.filter(gyro_x_diff_abs);
    gyro_y_diff_abs = lowPassFilter2.filter(gyro_y_diff_abs);
    gyro_z_diff_abs = lowPassFilter2.filter(gyro_z_diff_abs);

    // Identify stationary points for each axis of each sensor based on the threshold
    const acc_x_stationary = thresholdBasedWindowAveraging(acc_x_diff_abs, gnssTime, WINDOW_SIZE_MS, ACC_THRESHOLD);
    const acc_y_stationary = thresholdBasedWindowAveraging(acc_y_diff_abs, gnssTime, WINDOW_SIZE_MS, ACC_THRESHOLD);
    const acc_z_stationary = thresholdBasedWindowAveraging(acc_z_diff_abs, gnssTime, WINDOW_SIZE_MS, ACC_THRESHOLD);
    const gyro_x_stationary = thresholdBasedWindowAveraging(gyro_x_diff_abs, gnssTime, WINDOW_SIZE_MS, GYRO_THRESHOLD);
    const gyro_y_stationary = thresholdBasedWindowAveraging(gyro_y_diff_abs, gnssTime, WINDOW_SIZE_MS, GYRO_THRESHOLD);
    const gyro_z_stationary = thresholdBasedWindowAveraging(gyro_z_diff_abs, gnssTime, WINDOW_SIZE_MS, GYRO_THRESHOLD);

    // For gyro and accel ensure 2 out of the three axes are stationary
    // OR the gyro and accel together to try to capture everything
    const combined_gyro_accel: boolean[] = [];
    for (let i = 0; i < acc_x_stationary.length; i++) {
        const acc_x_stationary_val: boolean = acc_x_stationary[i];
        const acc_y_stationary_val: boolean = acc_y_stationary[i];
        const acc_z_stationary_val: boolean = acc_z_stationary[i];
        const gyro_x_stationary_val: boolean = gyro_x_stationary[i];
        const gyro_y_stationary_val: boolean = gyro_y_stationary[i];
        const gyro_z_stationary_val: boolean = gyro_z_stationary[i];

        const acc_res: boolean = ((acc_x_stationary_val && acc_y_stationary_val) || (acc_y_stationary_val && acc_z_stationary_val) || (acc_x_stationary_val && acc_z_stationary_val)) ? true : false;
        const gyro_res: boolean = ((gyro_x_stationary_val && gyro_y_stationary_val) || (gyro_y_stationary_val && gyro_z_stationary_val) || (gyro_x_stationary_val && gyro_z_stationary_val)) ? true : false;
        const combined: boolean = acc_res || gyro_res;

        combined_gyro_accel.push(combined);
    }

    // Reject points that gnss deams not stationary
    for (let i = 0; i < hdop.length; i++) {
        if (hdop[i] < HDOP_THRESHOLD && gnssSpeed[i] > SPEED_THRESHOLD && combined_gyro_accel[i] === true) {
            combined_gyro_accel[i] = false;
        }
    }

    // const resultDict = {
    //     stationary: combined_gyro_accel,
    //     gnssTime: gnssTime,
    //     gnssSpeed: gnssSpeed,
    //     acc_x: acc_x,
    //     acc_y: acc_y,
    //     acc_z: acc_z,
    //     gyro_x: gyro_x,
    //     gyro_y: gyro_y,
    //     gyro_z: gyro_z,
    //     acc_x_diff_abs: acc_x_diff_abs,
    //     acc_y_diff_abs: acc_y_diff_abs,
    //     acc_z_diff_abs: acc_z_diff_abs,
    //     gyro_x_diff_abs: gyro_x_diff_abs,
    //     gyro_y_diff_abs: gyro_y_diff_abs,
    //     gyro_z_diff_abs: gyro_z_diff_abs,
    // }

    // realign the combined_gyro_accel array to match the gnssTime array if needed
    if (combined_gyro_accel.length !== gnssTime.length) {
        combined_gyro_accel.unshift(combined_gyro_accel[0]);
    }

    return combined_gyro_accel;
}

function thresholdBasedWindowAveraging(data: number[], times: number[], windowSizeMs: number, threshold: number): boolean[] {
    const output: boolean[] = [];
    // Convert data and times to arrays if they are not already
    const numPoints: number = times.length;
    // Initialize start and end indices for the sliding window
    let windowStart: number = 0;
    let windowEnd: number = 0;

    // Slide the window and compute output
    while (windowEnd < numPoints) {
        // Determine the end time for the current window
        const windowEndTime: number = times[windowStart] + windowSizeMs;

        // Find data points within the current window
        const windowDataIndices: number[] = [];
        for (let i = windowStart; i < numPoints && times[i] < windowEndTime; i++) {
            windowDataIndices.push(i);
        }

        // Calculate the average value within the window
        let windowSum = 0;
        for (const dataIndex of windowDataIndices) {
            windowSum += data[dataIndex];
        }
        const windowAverage: number = windowSum / windowDataIndices.length;

        // Determine the output for the current window based on the threshold
        const windowOutput: boolean = windowAverage >= threshold ? false : true;

        // Add the window output to the output list
        for (const dataIndex of windowDataIndices) {
            output.push(windowOutput);
        }

        // Slide the window
        windowStart = windowDataIndices[windowDataIndices.length - 1] + 1;
        windowEnd = windowStart;
    }

    return output;
}

function takeAbsoluteValue(inputArray: number[]): number[] {
    // Map each element to its absolute value
    return inputArray.map(num => Math.abs(num));
}

function calculatePaddedDiff(inputArray: number[]): number[] {
    // Calculate the differences between consecutive elements
    let diffArray: number[] = [];
    for (let i = 1; i < inputArray.length; i++) {
        diffArray.push(inputArray[i] - inputArray[i - 1]);
    }

    // Pad the difference array to maintain the same length
    let paddedDiffArray: number[] = [diffArray[0], ...diffArray];
    
    return paddedDiffArray;
}

function calculateAverageFrequency(epoch_times_ms: number[]): number {
    /**
     * Calculates the average frequency of events given a list of epoch times in milliseconds.
     * 
     * @param epoch_times_ms List of epoch times in milliseconds. The list should start at zero and represent successive events.
     * @returns The average frequency of the events in Hz (events per second).
     */
    if (epoch_times_ms.length < 2) {
        return 0;
    }

    const periods_seconds: number[] = [];
    for (let i = 1; i < epoch_times_ms.length; i++) {
        periods_seconds.push((epoch_times_ms[i] - epoch_times_ms[i - 1]) / 1000);
    }

    const average_period_seconds: number = periods_seconds.reduce((acc, curr) => acc + curr, 0) / periods_seconds.length;
    const average_frequency: number = average_period_seconds !== 0 ? 1 / average_period_seconds : 0;

    return average_frequency;
}

/**
 * Linearly interpolates values given a set of time stamps and values
 * Ref: https://en.wikipedia.org/wiki/Linear_interpolation
 * @param ts Current time stamps
 * @param values Current values
 * @param newTs Desired time stamps
 * @returns Interpolated values
 */
export function linearInterpolation(
    ts: number[],
    values: number[],
    newTs: number[],
  ): number[] {
    // Ensure the input arrays are of the same length
    if (ts.length !== values.length) {
      throw new Error('Timestamps and values arrays must be of the same length');
    }
  
    // Function to interpolate a value for a single new timestamp
    const interpolateValue = (t: number): number => {
      // Handling cases where t is outside the given ts range
      if (t <= ts[0]) return values[0];
      if (t >= ts[ts.length - 1]) return values[values.length - 1];
  
      // Finding the appropriate segment for interpolation
      for (let i = 0; i < ts.length - 1; i++) {
        if (t >= ts[i] && t <= ts[i + 1]) {
          // Linear interpolation formula
          const ratio = (t - ts[i]) / (ts[i + 1] - ts[i]);
          return values[i] + ratio * (values[i + 1] - values[i]);
        }
      }
  
      // Fallback for any unexpected case
      throw new Error('Unexpected case in linear interpolation');
    };
  
    // Apply interpolation to each new timestamp
    return newTs.map(interpolateValue);
}





//--------------------------------- Testing Code Section ---------------------------------


// interface Chunk {
//     imuRecords: ImuRecord[];
//     gnssRecords: GnssRecord[];
// }
// function chunkRecordsByTime(imuRecords: ImuRecord[], gnssRecords: GnssRecord[], timeIncrementMs: number): Chunk[] {
//     const chunks: Chunk[] = [];
//     let currentGnssIndex = 0;
//     console.log('gnssrecords Time: ', gnssRecords[0].system_time);

//     while (currentGnssIndex < gnssRecords.length) {
//         const currentGnssRecord = gnssRecords[currentGnssIndex];
//         const currentChunkEndTime = currentGnssRecord.system_time + timeIncrementMs;

//         const currentChunk: Chunk = {
//             imuRecords: [],
//             gnssRecords: []
//         };

//         // Find GNSS records within the current chunk
//         while (currentGnssIndex < gnssRecords.length && gnssRecords[currentGnssIndex].time < currentChunkEndTime) {
//             currentChunk.gnssRecords.push(gnssRecords[currentGnssIndex]);
//             currentGnssIndex++;
//         }

//         // Find IMU records within the time frame of the current chunk
//         for (const imuRecord of imuRecords) {
//             if (imuRecord.system_time >= currentGnssRecord.system_time && imuRecord.system_time < currentChunkEndTime) {
//                 currentChunk.imuRecords.push(imuRecord);
//             }
//         }

//         chunks.push(currentChunk);
//     }

//     return chunks;
// }


// function writeToJSONFile(data: Record<string, any>, filePath: string): void {
//     // Convert the data to a JSON string
//     const jsonData = JSON.stringify(data, null, 2); // Adding null and 2 as parameters makes the JSON string formatted with indentation

//     // Write the JSON data to the file
//     fs.writeFileSync(filePath, jsonData);

//     console.log(`Data written to ${filePath}`);
// }

// function readJSONFile(filePath: string): any {
//     try {
//         const jsonData = fs.readFileSync(filePath, 'utf-8');
//         return JSON.parse(jsonData);
//     } catch (error) {
//         console.error('Error reading JSON file:', error);
//         return null;
//     }
// }

// // Main section to test the above code
// console.log('Starting stationary detection');
// // Read the input data from the JSON files
// const allData = readJSONFile('/Users/rogerberman/hivemapper/sensor-fusion/testingScripts/spectacular-grass-window_session_data.json');

// // Extract the GNSS and IMU data and put into GnssRecord and ImuRecord arrays
// let gnssData: GnssRecord[] = [];
// let imuData: ImuRecord[] = [];
// for (const session in allData)  {
//     console.log('Processing session: ', session);
//     // console.log(allData[session])
//     const acc_x_data = allData[session].acc_x;
//     const acc_y_data = allData[session].acc_y;
//     const acc_z_data = allData[session].acc_z;
//     const gyro_x_data = allData[session].gyro_x;
//     const gyro_y_data = allData[session].gyro_y;
//     const gyro_z_data = allData[session].gyro_z;
//     const imu_time = allData[session].imu_time;
//     const gnss_time = allData[session].gnss_system_time;
//     const hdop = allData[session].hdop;
//     const speed = allData[session].speed;
//     for(let i = 0; i < acc_x_data.length; i++) {
//         const imuRecord: ImuRecord = {
//             id: i,
//             time: imu_time[i],
//             system_time: imu_time[i],
//             acc_x: acc_x_data[i],
//             acc_y: acc_y_data[i],
//             acc_z: acc_z_data[i],
//             gyro_x: gyro_x_data[i],
//             gyro_y: gyro_y_data[i],
//             gyro_z: gyro_z_data[i],
//             temperature: 0,
//             session: session
//         };
//         imuData.push(imuRecord);
//     }
//     for(let i = 0; i < gnss_time.length; i++) {
//         const gnssRecord: GnssRecord = {
//             time: gnss_time[i],
//             system_time: gnss_time[i],
//             actual_system_time: gnss_time[i],
//             fix: 'fix',
//             ttff: 0,
//             latitude: 0,
//             longitude: 0,
//             altitude: 0,
//             speed: speed[i],
//             heading: 0,
//             dilution: 0,
//             satellites_seen: 0,
//             satellites_used: 0,
//             eph: 0,
//             horizontal_accuracy: 0,
//             vertical_accuracy: 0,
//             heading_accuracy: 0,
//             speed_accuracy: 0,
//             hdop: hdop[i],
//             vdop: 0,
//             xdop: 0,
//             ydop: 0,
//             tdop: 0,
//             pdop: 0,
//             gdop: 0,
//             rf_jamming_state: 'rf_jamming_state',
//             rf_ant_status: 'rf_ant_status',
//             rf_ant_power: 'rf_ant_power',
//             rf_post_status: 0,
//             rf_noise_per_ms: 0,
//             rf_agc_cnt: 0,
//             rf_jam_ind: 0,
//             rf_ofs_i: 0,
//             rf_mag_i: 0,
//             rf_ofs_q: 0,
//             gga: 'gga',
//             rxm_measx: 'rxm_measx',
//             session: session
//         };
//         gnssData.push(gnssRecord);
//     }

// }
// console.log('GNSS data length: ', gnssData.length);
// console.log('IMU data length: ', imuData.length);

// let OverallResult: {
//     stationary: boolean[];
//     gnssTime: number[];
//     gnssSpeed: number[];
//     acc_x: number[];
//     acc_y: number[];
//     acc_z: number[];
//     gyro_x: number[];
//     gyro_y: number[];
//     gyro_z: number[];
//     acc_x_diff_abs: number[];
//     acc_y_diff_abs: number[];
//     acc_z_diff_abs: number[];
//     gyro_x_diff_abs: number[];
//     gyro_y_diff_abs: number[];
//     gyro_z_diff_abs: number[];
// } = {
//     stationary: [],
//     gnssTime: [],
//     gnssSpeed: [],
//     acc_x: [],
//     acc_y: [],
//     acc_z: [],
//     gyro_x: [],
//     gyro_y: [],
//     gyro_z: [],
//     acc_x_diff_abs: [],
//     acc_y_diff_abs: [],
//     acc_z_diff_abs: [],
//     gyro_x_diff_abs: [],
//     gyro_y_diff_abs: [],
//     gyro_z_diff_abs: [],
// };
// // Chunk the data by time
// const timeIncrementMs = 1000 * 20;
// const chunks = chunkRecordsByTime(imuData, gnssData, timeIncrementMs);
// console.log('Number of chunks: ', chunks.length);
// for (const chunk of chunks) {
//     const result = stationaryDetection(chunk.gnssRecords, chunk.imuRecords);
//     // console.log('Result length: ', result.stationary.length);
//     OverallResult.stationary = OverallResult.stationary.concat(result.stationary);
//     OverallResult.gnssTime = OverallResult.gnssTime.concat(result.gnssTime);
//     OverallResult.gnssSpeed = OverallResult.gnssSpeed.concat(result.gnssSpeed);
//     OverallResult.acc_x = OverallResult.acc_x.concat(result.acc_x);
//     OverallResult.acc_y = OverallResult.acc_y.concat(result.acc_y);
//     OverallResult.acc_z = OverallResult.acc_z.concat(result.acc_z);
//     OverallResult.gyro_x = OverallResult.gyro_x.concat(result.gyro_x);
//     OverallResult.gyro_y = OverallResult.gyro_y.concat(result.gyro_y);
//     OverallResult.gyro_z = OverallResult.gyro_z.concat(result.gyro_z);
//     OverallResult.acc_x_diff_abs = OverallResult.acc_x_diff_abs.concat(result.acc_x_diff_abs);
//     OverallResult.acc_y_diff_abs = OverallResult.acc_y_diff_abs.concat(result.acc_y_diff_abs);
//     OverallResult.acc_z_diff_abs = OverallResult.acc_z_diff_abs.concat(result.acc_z_diff_abs);
//     OverallResult.gyro_x_diff_abs = OverallResult.gyro_x_diff_abs.concat(result.gyro_x_diff_abs);
//     OverallResult.gyro_y_diff_abs = OverallResult.gyro_y_diff_abs.concat(result.gyro_y_diff_abs);
//     OverallResult.gyro_z_diff_abs = OverallResult.gyro_z_diff_abs.concat(result.gyro_z_diff_abs);
// }
// console.log('Overall Result length: ', OverallResult.stationary.length);


// // const result = stationaryDetection(gnssData, imuData);
// // // Output result to json
// writeToJSONFile(OverallResult, '/Users/rogerberman/hivemapper/sensor-fusion/testingScripts/stationary_detection_result.json');