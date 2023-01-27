import { app } from 'index';
import { UpdateCameraConfigService } from 'services/updateCameraConfig';
import request from 'supertest';
import { getCameraConfig } from 'util/index';

const mockDefaultConfig = {
  recording: {
    directory: {
      prefix: '',
      output: '/mnt/data/pic/',
      minfreespace: 64000000,
      output2: '/media/usb0/recording/',
      minfreespace2: 32000000,
      maxusedspace: 16106127360,
    },
  },
  camera: {
    encoding: {
      fps: 10,
      width: 4056,
      height: 2160,
      codec: 'mjpeg',
    },
    adjustment: {
      hflip: false,
      vflip: false,
      denoise: 'off',
      rotation: 180,
    },
  },
};
const mockConfig2K = {
  recording: {
    directory: {
      prefix: '',
      output: '/mnt/data/pic/',
      minfreespace: 64000000,
      output2: '/media/usb0/recording/',
      minfreespace2: 32000000,
      maxusedspace: 16106127360,
    },
  },
  camera: {
    encoding: {
      fps: 10,
      width: 2048,
      height: 1080,
      codec: 'mjpeg',
    },
    adjustment: {
      hflip: false,
      vflip: false,
      denoise: 'off',
      rotation: 180,
    },
  },
};

jest.spyOn(UpdateCameraConfigService, 'execute');

describe('Camera Configuration endpoints', () => {
  describe('GET /config/cameraconfig', () => {
    it('should return 200 with the current camera configurations', async () => {
      const res = await request(await app)
        .get('/config/cameraconfig')
        .send({});
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(mockDefaultConfig);
    });
  });

  describe('POST /config/cameraconfig', () => {
    it('should return 200 with updated configurations', async () => {
      const res = await request(await app)
        .post('/config/cameraconfig')
        .send({ config: mockConfig2K });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ output: 'done' });

      // verify local cache
      expect(getCameraConfig()).toEqual(mockConfig2K);
    });
  });
});
