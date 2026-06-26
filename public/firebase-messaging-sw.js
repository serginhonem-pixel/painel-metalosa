/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCD0MUk6azoj-cp1v5TP5Q0QP80SKNq-ds',
  authDomain: 'inventario-bobina2.firebaseapp.com',
  projectId: 'inventario-bobina2',
  storageBucket: 'inventario-bobina2.firebasestorage.app',
  messagingSenderId: '628276135464',
  appId: '1:628276135464:web:e33c84479c8fccb0c7171d',
  measurementId: 'G-TZS89ZE0TS',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'Atualizacao de OS';
  const options = {
    body: payload?.notification?.body || '',
    icon: '/icon-192.png',
    data: payload?.data || {},
  };
  self.registration.showNotification(title, options);
});
