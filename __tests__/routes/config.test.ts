import app from 'index';
import request from 'supertest';


describe('Config handlers', () => {

  describe('PUT /config/resolution', () => {

    it('should return 200 && update resolution with a valid resolution type', async () => {
      const res = await request(app)
        .put('/config/resolution')
        .send({ resolution: '4K' })
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ output: 'done' });
    })

    it('should return 400 with passed an invalid resolution type', async () => {
      const res = await request(app)
        .put('/config/resolution')
        .send({})
      expect(res.statusCode).toBe(400)
      expect(res.body).toMatchObject({ error: 'Resolutions supported: 4K, 2K, 1K' })
    })

  })
})