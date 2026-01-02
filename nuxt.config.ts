// Nuxt 3 configuration for the house viewer
export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },
  runtimeConfig: {
    authSecret: 'dev-auth-secret-change-me',
    authUsers: [
      { email: 'marzev@gmail.com', password: '1234' },
      { email: 'demo@example.com', password: 'demo123' }
    ],
    public: {
      // Path to the structure model served from /public
      structureModel: '/models/House_structure.json',
      // Path to the finishes model served from /public
      finishesModel: '/models/House_Finishes.json',
      // Path to the plumbing model served from /public
      plumbingModel: '/models/House_Plumbing.json',
      // Path to the sensors model served from /public
      sensorsModel: '/models/House_Sensors.json',
      // Path to the landscape model served from /public
      landscapeModel: '/models/House_Landscape.json',
      // Path to the adjacent buildings model served from /public
      adjacentBuildingsModel: '/models/House_AdjacentBuildings.json',
      openWeatherMapApiKey: process.env.MYOPENWEATHERMAPAPIKEY || ''
    }
  },
  app: {
    head: {
      title: 'House Viewer',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ]
    }
  }
});
