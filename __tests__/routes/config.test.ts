import { config } from 'process';
import request from 'supertest';

import router from '../../src/routes/config';



describe('Config handlers', () => {

  describe('PUT /config/resolution', () => {

    it('should return 200 && update resolution with a valid resolution type', async () => {
      const res = request(router)
        .put('/config/resolution')
        .


    })

    it('should return 400 with passed an invalid resolution type', async () => {

    })

  })
})