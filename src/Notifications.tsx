import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp } from '@react-native-firebase/app';
import messaging from '@react-native-firebase/messaging';
import notifee, { 
  AndroidImportance, 
  AndroidStyle, 
  AndroidVisibility 
} from '@notifee/react-native';

// Your backend URL
const API_BASE = "https://ba-lhhs.onrender.com";

class NotificationService {
  private static instance: NotificationService;
  private listeners: Map<string, Function[]> = new Map();
  private fcmToken: string | null = null;
  private notificationInitialized = false;

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }



  async createNotificationChannel() {
    if (Platform.OS === 'android') {
      try {
        await notifee.createChannel({
          id: 'ride_requests_high',
          name: 'Ride Requests',
          description: 'High priority ride notifications with sound',
          importance: AndroidImportance.HIGH,
          sound: 'notification',
          vibration: true,
          lights: true,
          bypassDnd: true,
          visibility: AndroidVisibility.PUBLIC,
        });
        console.log('✅ Android notification channel created WITH SOUND');
      } catch (error) {
        console.error('❌ Error creating notification channel:', error);
      }
    }
  }

  setupForegroundHandler() {
    try {
      console.log('📱 Setting up foreground message handler WITH SOUND...');
      
      return messaging().onMessage(async remoteMessage => {
        console.log('📱 🔵 FOREGROUND FCM message received:', remoteMessage);
        
        // Parse the notification data
        const data = remoteMessage.data || {};
        const notification = remoteMessage.notification || {};
        
        console.log('📱 Notification data:', data);
        console.log('📱 Notification body:', notification);
        
        // ✅ CRITICAL: Handle ride requests
        if (data.type === 'ride_request') {
          console.log('🎯 RIDE REQUEST DETECTED in foreground');
          
          // Combine all data
          const rideData = {
            ...data,
            notificationTitle: notification.title,
            notificationBody: notification.body,
            timestamp: new Date().toISOString()
          };
          
          console.log('📢 Emitting rideRequest event with combined data:', rideData);
          
          // Show local notification immediately
          await this.showLocalNotification({
            title: notification.title || '🚖 New Ride Request',
            body: notification.body || 'Tap to view ride details',
            data: data
          });
          
          // Emit event for immediate UI update
          setTimeout(() => {
            this.emit('rideRequest', rideData);
            console.log('✅ rideRequest event emitted for immediate UI update');
          }, 100);
        }
      });

    } catch (error) {
      console.error('❌ Error setting up foreground handler:', error);
    }
  }


  async initializeNotifications() {
  try {
    console.log('🔔 Setting up notification system WITH SOUND...');
    
    // ✅ FIX: Use modular API
    const messagingModule = messaging();
    
    // Request permissions using modular API
    const authStatus = await messagingModule.hasPermission();
    if (!authStatus) {
      const permission = await messagingModule.requestPermission();
      if (!permission) {
        console.log('❌ Notification permission not granted');
        return false;
      }
    }

    // Create notification channel WITH SOUND
    await this.createNotificationChannel();
    
    // Get FCM token using modular API
    await this.getFCMToken();
    
    // Setup all handlers
    this.setupForegroundHandler();
    this.setupBackgroundHandler();
    this.setupTokenRefreshHandler();
    
    this.notificationInitialized = true;
    console.log('✅ Notification system initialized WITH SOUND');
    return true;
  } catch (error) {
    console.error('❌ Error in notification system initialization:', error);
    return false;
  }
}

async getFCMToken(): Promise<string | null> {
  try {
    console.log('🔑 Getting FCM token...');
    
    // ✅ FIX: Use modular API
    const messagingModule = messaging();
    const token = await messagingModule.getToken();
    
    if (token) {
      this.fcmToken = token;
      console.log('✅ FCM Token obtained:', token.substring(0, 20) + '...');
      
      await AsyncStorage.setItem('fcmToken', token);
      return token;
    } else {
      console.log('❌ No FCM token received');
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting FCM token:', error);
    return null;
  }
}

setupForegroundHandler() {
  try {
    console.log('📱 Setting up foreground message handler WITH SOUND...');
    
    // ✅ FIX: Use modular API
    const messagingModule = messaging();
    
    return messagingModule.onMessage(async remoteMessage => {
      console.log('📱 🔵 FOREGROUND FCM message received:', remoteMessage);
      
      // Parse the notification data
      const data = remoteMessage.data || {};
      const notification = remoteMessage.notification || {};
      
      console.log('📱 Notification data:', data);
      console.log('📱 Notification body:', notification);
      
      // Handle ride requests
      if (data.type === 'ride_request') {
        console.log('🎯 RIDE REQUEST DETECTED in foreground');
        
        // Combine all data
        const rideData = {
          ...data,
          notificationTitle: notification.title,
          notificationBody: notification.body,
          timestamp: new Date().toISOString()
        };
        
        console.log('📢 Emitting rideRequest event with combined data:', rideData);
        
        // Show local notification immediately
        await this.showLocalNotification({
          title: notification.title || '🚖 New Ride Request',
          body: notification.body || 'Tap to view ride details',
          data: data
        });
        
        // Emit event for immediate UI update
        setTimeout(() => {
          this.emit('rideRequest', rideData);
          console.log('✅ rideRequest event emitted for immediate UI update');
        }, 100);
      }
    });

  } catch (error) {
    console.error('❌ Error setting up foreground handler:', error);
  }
}

async setupBackgroundHandler() {
  try {
    console.log('📱 Setting up background handler WITH SOUND...');
    
    // ✅ FIX: Use modular API
    const messagingModule = messaging();
    
    messagingModule.setBackgroundMessageHandler(async remoteMessage => {
      console.log('📱 🟢 BACKGROUND FCM RECEIVED:', remoteMessage?.data);
      
      // Extract data
      const data = remoteMessage?.data || {};
      const notification = remoteMessage?.notification || {};
      
      // Show notification with SOUND in background
      await this.showLocalNotification({
        title: notification.title || data.title || '🚖 New Ride Request',
        body: notification.body || data.body || 'Tap to view ride details',
        data: data
      });

      // Store for when app opens
      if (data.type === 'ride_request') {
        await AsyncStorage.setItem('pendingRideRequest', JSON.stringify(data));
        console.log('💾 Saved pending ride request for app open');
      }
      
      return Promise.resolve();
    });

  } catch (error) {
    console.error('❌ Background handler setup failed:', error);
  }
}

setupTokenRefreshHandler() {
  try {
    // ✅ FIX: Use modular API
    const messagingModule = messaging();
    
    messagingModule.onTokenRefresh(async (newToken) => {
      console.log('🔄 FCM token refreshed:', newToken.substring(0, 20) + '...');
      
      // Update token in backend
      try {
        const authToken = await AsyncStorage.getItem("authToken");
        const driverId = await AsyncStorage.getItem("driverId");
        
        if (authToken && driverId) {
          const response = await fetch(`${API_BASE}/api/drivers/update-fcm-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              driverId: driverId,
              fcmToken: newToken,
              platform: Platform.OS
            }),
          });
          
          if (response.ok) {
            console.log('✅ FCM token updated on server');
          } else {
            console.log('❌ Failed to update FCM token:', response.status);
          }
        }
      } catch (error) {
        console.error('❌ Error updating FCM token:', error);
      }
      
      // Emit event for app to handle
      this.emit('tokenRefresh', newToken);
    });
  } catch (error) {
    console.error('❌ Error setting up token refresh handler:', error);
  }
}


  // In Notifications.tsx, update the showLocalNotification method:

async showLocalNotification(notification: {
  title: string;
  body: string;
  data?: any;
}) {
  try {
    console.log('🔔 Displaying HIGH PRIORITY notification WITH SOUND:', notification.title);
    
    // IMPORTANT FIX: Use a valid Android icon name
    // Common valid icon names: 'ic_launcher', 'ic_stat_notification', 'notification_icon'
    const androidConfig = {
      channelId: 'ride_requests_high',
      smallIcon: 'ic_launcher', // CHANGE THIS to a valid icon name
      color: '#4CAF50',
      pressAction: {
        id: 'default',
        launchActivity: 'default',
      },
      sound: 'notification',
      lights: ['#4CAF50', 300, 1000],
      importance: AndroidImportance.HIGH,
      priority: 'high',
      visibility: AndroidVisibility.PUBLIC,
      autoCancel: true,
      ongoing: false,
    };

    await notifee.displayNotification({
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      android: androidConfig,
      ios: {
        sound: 'default',
        critical: true,
        criticalVolume: 1.0,
      },
    });
    
    console.log('✅ HIGH PRIORITY notification displayed WITH SOUND');
  } catch (error) {
    console.error('❌ Error showing notification:', error);
    // Don't crash the app if notification fails
  }
}



  setupTokenRefreshHandler() {
    try {
      // Use modular API for token refresh
      messaging().onTokenRefresh(async (newToken) => {
        console.log('🔄 FCM token refreshed:', newToken.substring(0, 20) + '...');
        
        // Update token in backend
        try {
          const authToken = await AsyncStorage.getItem("authToken");
          const driverId = await AsyncStorage.getItem("driverId");
          
          if (authToken && driverId) {
            const response = await fetch(`${API_BASE}/api/drivers/update-fcm-token`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
              },
              body: JSON.stringify({
                driverId: driverId,
                fcmToken: newToken,
                platform: Platform.OS
              }),
            });
            
            if (response.ok) {
              console.log('✅ FCM token updated on server');
            } else {
              console.log('❌ Failed to update FCM token:', response.status);
            }
          }
        } catch (error) {
          console.error('❌ Error updating FCM token:', error);
        }
        
        // Emit event for app to handle
        this.emit('tokenRefresh', newToken);
      });
    } catch (error) {
      console.error('❌ Error setting up token refresh handler:', error);
    }
  }

  // Event emitter methods
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
    console.log(`✅ Registered listener for: ${event}`);
  }

  off(event: string, callback: Function) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event)!;
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any) {
    if (this.listeners.has(event)) {
      console.log(`📢 Emitting event: ${event}`, data);
      this.listeners.get(event)!.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ Error in ${event} listener:`, error);
        }
      });
    }
  }

  // Check for pending notifications
  async checkPendingNotifications() {
    try {
      console.log('🔍 Checking for pending notifications...');

      // Check for pending ride requests in AsyncStorage
      const pendingRideRequest = await AsyncStorage.getItem('pendingRideRequest');
      if (pendingRideRequest) {
        console.log('📱 Found pending ride request in storage');
        const rideData = JSON.parse(pendingRideRequest);
        
        // Emit the ride request event
        setTimeout(() => {
          this.emit('rideRequest', rideData);
          console.log('✅ Emitted pending ride request');
        }, 2000);
        
        // Clear the stored request
        await AsyncStorage.removeItem('pendingRideRequest');
      }

      // Check for initial notification when app opens from quit state
      const initialNotification = await notifee.getInitialNotification();
      if (initialNotification) {
        console.log('📱 App opened from QUIT state by notification:', initialNotification);
        
        if (initialNotification.notification.data?.type === 'ride_request') {
          console.log('📱 Processing ride request from quit state');
          setTimeout(() => {
            this.emit('rideRequest', initialNotification.notification.data);
          }, 3000);
        }
      }

      // Listen for notification opened from background
      notifee.onForegroundEvent(({ type, detail }) => {
        if (type === 'press' && detail.notification) {
          console.log('📱 Notification opened from BACKGROUND:', detail.notification);
          
          if (detail.notification.data?.type === 'ride_request') {
            this.emit('rideRequest', detail.notification.data);
          }
        }
      });

    } catch (error) {
      console.error('❌ Error checking pending notifications:', error);
    }
  }

  async testNotification() {
    await this.showLocalNotification({
      title: '🔊 Sound Test',
      body: 'This should work NOW without vibration errors!',
      data: { 
        test: "true",
        sound: "enabled",
        type: "test_notification"
      }
    });
  }
}

export default NotificationService.getInstance();


// import { Platform, AppState } from 'react-native';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { getApp } from '@react-native-firebase/app';
// import messaging from '@react-native-firebase/messaging';
// import notifee, { 
//   AndroidImportance, 
//   AndroidStyle, 
//   AndroidVisibility 
// } from '@notifee/react-native';

// // Your backend URL
// const API_BASE = "https://ba-lhhs.onrender.com";

// class NotificationService {
//   private static instance: NotificationService;
//   private listeners: Map<string, Function[]> = new Map();
//   private fcmToken: string | null = null;
//   private notificationInitialized = false;

//   static getInstance(): NotificationService {
//     if (!NotificationService.instance) {
//       NotificationService.instance = new NotificationService();
//     }
//     return NotificationService.instance;
//   }

//   // Initialize notification system with SOUND
//   async initializeNotifications() {
//     try {
//       console.log('🔔 Setting up notification system WITH SOUND...');
      
//       // Request permissions using modular API
//       const authStatus = await messaging().hasPermission();
//       if (!authStatus) {
//         const permission = await messaging().requestPermission();
//         if (!permission) {
//           console.log('❌ Notification permission not granted');
//           return false;
//         }
//       }

//       // Create notification channel WITH SOUND
//       await this.createNotificationChannel();
      
//       // Get FCM token
//       await this.getFCMToken();
      
//       // Setup all handlers
//       this.setupForegroundHandler();
//       this.setupBackgroundHandler();
//       this.setupTokenRefreshHandler();
      
//       this.notificationInitialized = true;
//       console.log('✅ Notification system initialized WITH SOUND');
//       return true;
//     } catch (error) {
//       console.error('❌ Error in notification system initialization:', error);
//       return false;
//     }
//   }

//   async createNotificationChannel() {
//     if (Platform.OS === 'android') {
//       try {
//         await notifee.createChannel({
//           id: 'high_priority_channel',
//           name: 'Ride Requests',
//           description: 'High priority ride notifications with sound',
//           importance: AndroidImportance.HIGH,
//           sound: 'notification',
//           vibration: true,
//           lights: true,
//           bypassDnd: true,
//           visibility: AndroidVisibility.PUBLIC,
//         });
//         console.log('✅ Android notification channel created WITH SOUND');
//       } catch (error) {
//         console.error('❌ Error creating notification channel:', error);
//       }
//     }
//   }

//   setupForegroundHandler() {
//     try {
//       console.log('📱 Setting up foreground message handler WITH SOUND...');
      
//       return messaging().onMessage(async remoteMessage => {
//         console.log('📱 🔵 FOREGROUND FCM message received:', remoteMessage);
        
//         // Show local notification with SOUND
//         await this.showLocalNotification({
//           title: remoteMessage.notification?.title || '🚖 New Ride Request',
//           body: remoteMessage.notification?.body || 'Tap to view ride details',
//           data: remoteMessage.data
//         });

//         // Emit event for app to handle
//         if (remoteMessage.data?.type === 'ride_request') {
//           console.log('📱 Emitting rideRequest event from foreground');
//           this.emit('rideRequest', remoteMessage.data);
//         }
//       });

//     } catch (error) {
//       console.error('❌ Error setting up foreground handler:', error);
//     }
//   }

//   async setupBackgroundHandler() {
//     try {
//       console.log('📱 Setting up background handler WITH SOUND...');
      
//       // Use modular API for background handler
//       messaging().setBackgroundMessageHandler(async remoteMessage => {
//         console.log('📱 🟢 BACKGROUND FCM RECEIVED:', remoteMessage?.data);
        
//         // Show notification with SOUND in background
//         await this.showLocalNotification({
//           title: remoteMessage?.data?.title || '🚖 New Ride Request',
//           body: remoteMessage?.data?.body || 'Tap to view ride details',
//           data: remoteMessage?.data
//         });

//         // Store for when app opens
//         if (remoteMessage?.data?.type === 'ride_request') {
//           await AsyncStorage.setItem('pendingRideRequest', JSON.stringify(remoteMessage.data));
//           console.log('💾 Saved pending ride request for app open');
//         }
        
//         return Promise.resolve();
//       });

//     } catch (error) {
//       console.error('❌ Background handler setup failed:', error);
//     }
//   }

//   async showLocalNotification(notification: {
//     title: string;
//     body: string;
//     data?: any;
//   }) {
//     try {
//       console.log('🔔 Displaying HIGH PRIORITY notification WITH SOUND:', notification.title);
      
//       // Convert all data values to strings to avoid Notifee errors
//       const stringData: { [key: string]: string } = {};
//       if (notification.data) {
//         Object.keys(notification.data).forEach(key => {
//           stringData[key] = String(notification.data[key]);
//         });
//       }

//       const androidConfig = {
//         channelId: 'high_priority_channel',
//         smallIcon: 'ic_launcher',
//         color: '#FF0000',
//         pressAction: {
//           id: 'default',
//           launchActivity: 'default',
//         },
//         sound: 'notification',
//         lights: ['#FF0000', 300, 1000],
//         importance: AndroidImportance.HIGH,
//         priority: 'high',
//         visibility: AndroidVisibility.PUBLIC,
//         autoCancel: false,
//         ongoing: false,
//       };

//       await notifee.displayNotification({
//         title: notification.title,
//         body: notification.body,
//         data: stringData,
//         android: androidConfig,
//         ios: {
//           sound: 'default',
//           critical: true,
//           criticalVolume: 1.0,
//         },
//       });
      
//       console.log('✅ HIGH PRIORITY notification displayed WITH SOUND');
//     } catch (error) {
//       console.error('❌ Error showing notification:', error);
//       console.error('❌ Problematic data:', notification.data);
//     }
//   }

//   async getFCMToken(): Promise<string | null> {
//     try {
//       console.log('🔑 Getting FCM token...');
      
//       const token = await messaging().getToken();
      
//       if (token) {
//         this.fcmToken = token;
//         console.log('✅ FCM Token obtained:', token.substring(0, 20) + '...');
        
//         await AsyncStorage.setItem('fcmToken', token);
//         return token;
//       } else {
//         console.log('❌ No FCM token received');
//         return null;
//       }
//     } catch (error) {
//       console.error('❌ Error getting FCM token:', error);
//       return null;
//     }
//   }

//   setupTokenRefreshHandler() {
//     try {
//       // Use modular API for token refresh
//       messaging().onTokenRefresh(async (newToken) => {
//         console.log('🔄 FCM token refreshed:', newToken.substring(0, 20) + '...');
        
//         // Update token in backend
//         try {
//           const authToken = await AsyncStorage.getItem("authToken");
//           const driverId = await AsyncStorage.getItem("driverId");
          
//           if (authToken && driverId) {
//             const response = await fetch(`${API_BASE}/api/drivers/update-fcm-token`, {
//               method: 'POST',
//               headers: {
//                 'Content-Type': 'application/json',
//                 'Authorization': `Bearer ${authToken}`,
//               },
//               body: JSON.stringify({
//                 driverId: driverId,
//                 fcmToken: newToken,
//                 platform: Platform.OS
//               }),
//             });
            
//             if (response.ok) {
//               console.log('✅ FCM token updated on server');
//             } else {
//               console.log('❌ Failed to update FCM token:', response.status);
//             }
//           }
//         } catch (error) {
//           console.error('❌ Error updating FCM token:', error);
//         }
        
//         // Emit event for app to handle
//         this.emit('tokenRefresh', newToken);
//       });
//     } catch (error) {
//       console.error('❌ Error setting up token refresh handler:', error);
//     }
//   }

//   // Event emitter methods
//   on(event: string, callback: Function) {
//     if (!this.listeners.has(event)) {
//       this.listeners.set(event, []);
//     }
//     this.listeners.get(event)!.push(callback);
//     console.log(`✅ Registered listener for: ${event}`);
//   }

//   off(event: string, callback: Function) {
//     if (this.listeners.has(event)) {
//       const callbacks = this.listeners.get(event)!;
//       const index = callbacks.indexOf(callback);
//       if (index > -1) {
//         callbacks.splice(index, 1);
//       }
//     }
//   }

//   private emit(event: string, data: any) {
//     if (this.listeners.has(event)) {
//       console.log(`📢 Emitting event: ${event}`, data);
//       this.listeners.get(event)!.forEach(callback => {
//         try {
//           callback(data);
//         } catch (error) {
//           console.error(`❌ Error in ${event} listener:`, error);
//         }
//       });
//     }
//   }

//   // Check for pending notifications
//   async checkPendingNotifications() {
//     try {
//       console.log('🔍 Checking for pending notifications...');

//       // Check for initial notification
//       const initialNotification = await notifee.getInitialNotification();
//       if (initialNotification) {
//         console.log('📱 App opened from QUIT state by notification:', initialNotification);
        
//         if (initialNotification.notification.data?.type === 'ride_request') {
//           console.log('📱 Processing ride request from quit state');
//           setTimeout(() => {
//             this.emit('rideRequest', initialNotification.notification.data);
//           }, 3000);
//         }
//       }

//       // Listen for notification opened from background
//       notifee.onForegroundEvent(({ type, detail }) => {
//         if (type === 'press' && detail.notification) {
//           console.log('📱 Notification opened from BACKGROUND:', detail.notification);
          
//           if (detail.notification.data?.type === 'ride_request') {
//             this.emit('rideRequest', detail.notification.data);
//           }
//         }
//       });

//     } catch (error) {
//       console.error('❌ Error checking pending notifications:', error);
//     }
//   }

//   async testNotification() {
//     await this.showLocalNotification({
//       title: '🔊 Sound Test',
//       body: 'This should work NOW without vibration errors!',
//       data: { 
//         test: "true",
//         sound: "enabled",
//         type: "test_notification"
//       }
//     });
//   }
// }

// export default NotificationService.getInstance();