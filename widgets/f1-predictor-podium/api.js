'use strict';

module.exports = {
  async prediction({ homey }) {
    return homey.app.predictor.predict();
  },
};
