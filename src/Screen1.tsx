import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  AppState,
  Linking,
  Animated,
  ScrollView,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import Geolocation from "@react-native-community/geolocation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./apiConfig";
import api from "../utils/api";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import FontAwesome from "react-native-vector-icons/FontAwesome";
import BackgroundTimer from 'react-native-background-timer';
import NotificationService from './Notifications';

const { width, height } = Dimensions.get("window");

type LocationType = { latitude: number; longitude: number };
type RideType = {
  rideId: string;
  RAID_ID?: string;
  otp?: string;
  pickup: LocationType & { address?: string };
  drop: LocationType & { address?: string };
  routeCoords?: LocationType[];
  fare?: number;
  distance?: string;
  vehicleType?: string;
  userName?: string;
  userMobile?: string;
};
type UserDataType = {
  name: string;
  mobile: string;
  location: LocationType;
  userId?: string;
  rating?: number;
};

const DriverScreen = ({ route, navigation }: { route: any; navigation: any }) => {
  const [location, setLocation] = useState<LocationType | null>(
    route.params?.latitude && route.params?.longitude
      ? { latitude: route.params.latitude, longitude: route.params.longitude }
      : null
  );
  const [ride, setRide] = useState<RideType | null>(null);
  const [userData, setUserData] = useState<UserDataType | null>(null);
  const [userLocation, setUserLocation] = useState<LocationType | null>(null);
  const [travelledKm, setTravelledKm] = useState(0);
  const [lastCoord, setLastCoord] = useState<LocationType | null>(null);
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState("");
  const [rideStatus, setRideStatus] = useState<
    "idle" | "onTheWay" | "accepted" | "started" | "completed"
  >("idle");
  const [isRegistered, setIsRegistered] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [driverStatus, setDriverStatus] = useState<
    "offline" | "online" | "onRide"
  >("offline");
  const [isLoading, setIsLoading] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  const [driverId, setDriverId] = useState<string>(route.params?.driverId || "");
  const [driverName, setDriverName] = useState<string>(
    route.params?.driverName || ""
  );
  const [error, setError] = useState<string | null>(null);
  const [driverVehicleType, setDriverVehicleType] = useState("");

  // Route handling states
  const [fullRouteCoords, setFullRouteCoords] = useState<LocationType[]>([]);
  const [visibleRouteCoords, setVisibleRouteCoords] = useState<LocationType[]>([]);
  const [nearestPointIndex, setNearestPointIndex] = useState(0);
  const [mapRegion, setMapRegion] = useState<any>(null);

  // App state management
  const [isAppActive, setIsAppActive] = useState(true);

  // New states for verification and bill
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [billDetails, setBillDetails] = useState({
    distance: '0 km',
    travelTime: '0 mins',
    charge: 0,
    userName: '',
    userMobile: '',
    baseFare: 0,
    timeCharge: 0,
    tax: 0
  });
  const [verificationDetails, setVerificationDetails] = useState({
    pickup: '',
    dropoff: '',
    time: '',
    speed: 0,
    distance: 0,
  });
  const [otpSharedTime, setOtpSharedTime] = useState<Date | null>(null);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);


  const componentUnmounted = useRef(false);



  
  // Online/Offline toggle state
  const [isDriverOnline, setIsDriverOnline] = useState(false);
  const [backgroundTrackingActive, setBackgroundTrackingActive] = useState(false);
 
  // FCM Notification states
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);
  const [isBackgroundMode, setIsBackgroundMode] = useState(false);

  // Animation values
  const driverMarkerAnimation = useRef(new Animated.Value(1)).current;
  const polylineAnimation = useRef(new Animated.Value(0)).current;
  
  // Enhanced UI states - DEFAULT TO MAXIMIZED
  const [riderDetailsVisible, setRiderDetailsVisible] = useState(true);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  
  // Refs for optimization
  const isMounted = useRef(true);
  const locationUpdateCount = useRef(0);
  const mapAnimationInProgress = useRef(false);
  const navigationInterval = useRef<NodeJS.Timeout | null>(null);
  const lastLocationUpdate = useRef<LocationType | null>(null);
  const routeUpdateThrottle = useRef<NodeJS.Timeout | null>(null);
  const distanceSinceOtp = useRef(0);
  const lastLocationBeforeOtp = useRef<LocationType | null>(null);
  const geolocationWatchId = useRef<number | null>(null);
  const backgroundLocationInterval = useRef<NodeJS.Timeout | null>(null);
  const driverMarkerRef = useRef<any>(null);
  
  // Store OTP verification location
  const [otpVerificationLocation, setOtpVerificationLocation] = useState<LocationType | null>(null);
  
  // Alert for ride already taken
  const [showRideTakenAlert, setShowRideTakenAlert] = useState(false);
  const rideTakenAlertTimeout = useRef<NodeJS.Timeout | null>(null);
  const [alertProgress, setAlertProgress] = useState(new Animated.Value(1));
  
  // Split deduplication sets
  const [seenRideNotifications, setSeenRideNotifications] = useState<Set<string>>(new Set());
  const [acceptingRideIds, setAcceptingRideIds] = useState<Set<string>>(new Set());
  
  // Socket import
  let socket: any = null;
  try {
    socket = require("./socket").default;
  } catch (error) {
    console.warn("⚠️ Socket not available:", error);
  }
  

  const fetchPassengerData = useCallback((rideData: RideType): UserDataType => {
  console.log("👤 Extracting passenger data from ride:", rideData.rideId);

  // Try multiple fields for mobile
  const mobile = rideData.userMobile || 
                rideData.userPhone || 
                (rideData as any).phoneNumber || 
                "Contact Admin";

  console.log(`📱 Found mobile: ${mobile} from fields:`, {
    userMobile: rideData.userMobile,
    userPhone: rideData.userPhone,
    phoneNumber: (rideData as any).phoneNumber
  });

  const userDataWithId: UserDataType = {
    name: rideData.userName || "Passenger",
    mobile: mobile,
    location: rideData.pickup,
    userId: rideData.rideId,
    rating: 4.8,
  };

  console.log("✅ Passenger data extracted successfully:", userDataWithId);
  return userDataWithId;
}, []);


  // Calculate initials for avatar
  const calculateInitials = (name: string): string => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };


  const handleCallPassenger = () => {
  if (userData?.mobile && userData.mobile !== "N/A" && userData.mobile !== "Contact Admin") {
    // Clean the phone number
    const cleanNumber = userData.mobile.replace(/\D/g, '');
    
    if (cleanNumber.length >= 10) {
      Linking.openURL(`tel:${cleanNumber}`)
        .catch(err => {
          console.error('Error opening phone dialer:', err);
          Alert.alert("Error", "Unable to make call. Please try again.");
        });
    } else {
      Alert.alert("Invalid Number", "The mobile number format is invalid.");
    }
  } else {
    Alert.alert("Unavailable", "Passenger mobile number is not available for this ride.");
  }
};

  // Message passenger function
  const handleMessagePassenger = () => {
    if (userData?.mobile) {
      Linking.openURL(`sms:${userData.mobile}`)
        .catch(err => console.error('Error opening message app:', err));
    } else {
      Alert.alert("Error", "Passenger mobile number not available");
    }
  };

  // Animation functions for rider details
  const showRiderDetails = () => {
    setRiderDetailsVisible(true);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start();
  };

  const hideRiderDetails = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 400,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start(() => {
      setRiderDetailsVisible(false);
    });
  };

  const toggleRiderDetails = () => {
    if (riderDetailsVisible) {
      hideRiderDetails();
    } else {
      showRiderDetails();
    }
  };
  
  // Haversine distance function
  const haversine = (start: LocationType, end: LocationType) => {
    const R = 6371;
    const dLat = (end.latitude - start.latitude) * Math.PI / 180;
    const dLon = (end.longitude - start.longitude) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(start.latitude * Math.PI / 180) * Math.cos(end.latitude * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1000;
  };
  

  



  // Save ride state to AsyncStorage
const saveRideState = useCallback(async () => {
  try {
    const rideState = {
      ride,
      userData,
      rideStatus,
      driverStatus,
      travelledKm,
      distanceSinceOtp: distanceSinceOtp.current,
      lastLocationBeforeOtp: lastLocationBeforeOtp.current,
      otpVerificationLocation,
      fullRouteCoords,
      visibleRouteCoords,
      userLocation,
      lastCoord,
      riderDetailsVisible
    };
    
    await AsyncStorage.setItem('rideState', JSON.stringify(rideState));
    console.log('✅ Ride state saved to AsyncStorage');
  } catch (error) {
    console.error('❌ Error saving ride state:', error);
  }
}, [ride, userData, rideStatus, driverStatus, travelledKm, otpVerificationLocation, 
    fullRouteCoords, visibleRouteCoords, userLocation, lastCoord, riderDetailsVisible]);






    const restoreRideState = useCallback(async () => {
  try {
    const savedState = await AsyncStorage.getItem('rideState');
    if (savedState) {
      const rideState = JSON.parse(savedState);
      
      if (rideState.ride && (rideState.rideStatus === 'accepted' || rideState.rideStatus === 'started')) {
        console.log('🔄 Restoring active ride from storage');
        
        // Restore all state
        setRide(rideState.ride);
        setUserData(rideState.userData);
        setRideStatus(rideState.rideStatus);
        setDriverStatus(rideState.driverStatus);
        setTravelledKm(rideState.travelledKm || 0);
        distanceSinceOtp.current = rideState.distanceSinceOtp || 0;
        lastLocationBeforeOtp.current = rideState.lastLocationBeforeOtp;
        setOtpVerificationLocation(rideState.otpVerificationLocation);
        setFullRouteCoords(rideState.fullRouteCoords || []);
        setVisibleRouteCoords(rideState.visibleRouteCoords || []);
        setUserLocation(rideState.userLocation);
        setLastCoord(rideState.lastCoord);
        
        // Show UI based on ride status
        if (rideState.rideStatus === 'started') {
          setRiderDetailsVisible(true);
          slideAnim.setValue(0);
          fadeAnim.setValue(1);
          
          // Resume navigation
          startNavigation();
        }
        
        console.log('✅ Ride state restored successfully');
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('❌ Error restoring ride state:', error);
    return false;
  }
}, []);




  const validateVehicleType = (vehicleType: string): string => {
    const validTypes = ["bike", "taxi", "port", "sedan", "mini", "suv"];
    
    if (!vehicleType) {
      console.warn("⚠️ No vehicle type provided, defaulting to taxi");
      return "taxi";
    }
    
    const normalizedType = vehicleType.toLowerCase();
    
    if (!validTypes.includes(normalizedType)) {
      console.warn(`⚠️ Invalid vehicle type: ${vehicleType}, defaulting to taxi`);
      return "taxi";
    }
    
    console.log(`✅ Valid vehicle type: ${normalizedType}`);
    return normalizedType;
  };

  useEffect(() => {
    const loadVehicleType = async () => {
      const vehicleType = await AsyncStorage.getItem("driverVehicleType");
      if (vehicleType) {
        const validatedType = validateVehicleType(vehicleType);
        setDriverVehicleType(validatedType);
        console.log(`🚗 Loaded driver vehicle type: ${validatedType}`);
      }
    };
    loadVehicleType();
  }, []);
  
// Clear ride state function
const clearRideState = useCallback(async () => {
  try {
    // Clear all state variables
    setRide(null);
    setRideStatus("idle");
    setDriverStatus("online");
    setUserData(null);


    

    setPickupLocation(null);
    setDropoffLocation(null);
    setBookedPickupLocation(null);
    setRouteCoords([]);
    setFullRouteCoords([]);
    setVisibleRouteCoords([]);
    setOtpVerificationLocation(null);
    setTravelledKm(0);
    setDistance('');
    setTravelTime('');
    setEstimatedPrice(null);
    setBookingOTP('');
    setShowOTPInput(false);
    setShowLocationOverlay(true);
    setRealTimeNavigationActive(false);
    setHidePickupAndUserLocation(false);
    setFollowDriver(false);
    
    // Clear AsyncStorage
    await AsyncStorage.multiRemove([
      'currentRideId', 'acceptedDriver', 'rideStatus', 'bookingOTP',
      'driverLocation', 'ridePickupLocation', 'bookedPickupLocation',
      'rideDropoffLocation', 'rideRouteCoords'
    ]);
    
    // Force map refresh
    setMapKey(prev => prev + 1);
    
    console.log('✅ Ride state completely cleared');
  } catch (error) {
    console.error('❌ Error clearing ride state:', error);
  }
}, []);


  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (navigationInterval.current) {
        clearInterval(navigationInterval.current);
      }
      if (routeUpdateThrottle.current) {
        clearTimeout(routeUpdateThrottle.current);
      }
      if (geolocationWatchId.current) {
        Geolocation.clearWatch(geolocationWatchId.current);
      }
      if (backgroundLocationInterval.current) {
        clearInterval(backgroundLocationInterval.current);
      }
      if (rideTakenAlertTimeout.current) {
        clearTimeout(rideTakenAlertTimeout.current);
      }
      NotificationService.off('rideRequest', handleNotificationRideRequest);
      NotificationService.off('tokenRefresh', () => {});
    };
  }, []);
  
  // App state management
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      console.log('📱 App state changed:', nextAppState);
      
      if (nextAppState === 'background') {
        setIsAppActive(false);
        if (ride && (rideStatus === "accepted" || rideStatus === "started")) {
          saveRideState();
        }
      } else if (nextAppState === 'active') {
        setIsAppActive(true);
        if (!ride) {
          restoreRideState();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription.remove();
    };
  }, [ride, rideStatus, saveRideState, restoreRideState]);
  
  // Background location tracking with regular geolocation
  const startBackgroundLocationTracking = useCallback(() => {
    console.log("🔄 Starting background location tracking");
   
    if (geolocationWatchId.current) {
      Geolocation.clearWatch(geolocationWatchId.current);
    }
   
    geolocationWatchId.current = Geolocation.watchPosition(
      (position) => {
        if (!isMounted.current || !isDriverOnline) return;
       
        const newLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
       
        console.log("📍 Location update:", newLocation);
        setLocation(newLocation);
        setCurrentSpeed(position.coords.speed || 0);
       
        if (lastCoord && (rideStatus === "accepted" || rideStatus === "started")) {
          const dist = haversine(lastCoord, newLocation);
          const distanceKm = dist / 1000;
          setTravelledKm((prev) => prev + distanceKm);
         
          if (rideStatus === "started" && lastLocationBeforeOtp.current) {
            distanceSinceOtp.current += distanceKm;
          }
        }
       
        setLastCoord(newLocation);
        lastLocationUpdate.current = newLocation;
       
        saveLocationToDatabase(newLocation);
      },
      (error) => {
        console.error("❌ Geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 5,
        interval: 3000,
        fastestInterval: 2000,
      }
    );
   
    setBackgroundTrackingActive(true);
  }, [isDriverOnline, lastCoord, rideStatus]);
  




  // In your user app component
useEffect(() => {
  if (socket) {
    socket.on("rideAccepted", (data) => {
      console.log('✅ Ride accepted by driver:', data);
      
      // Update UI with driver details
      setDriverDetails({
        name: data.driverName,
        phone: data.driverMobile,
        vehicleType: data.driverVehicleType,
        vehicleNumber: data.driverVehicleNumber,
        rating: data.driverRating || 4.5
      });
      
      // Show OTP
      setShowOTP(true);
      setRideOTP(data.otp);
      
      // Update ride status
      setRideStatus('accepted');
      
      // Hide "Searching for drivers" UI
      setSearchingDrivers(false);
    });
    
    socket.on("driverLiveLocation", (data) => {
      // Update driver location on map
      setDriverLocation({
        latitude: data.latitude,
        longitude: data.longitude
      });
    });
    
    socket.on("rideStarted", (data) => {
      // Update UI when ride starts
      setRideStatus('started');
      // Start showing navigation route
    });
    
    return () => {
      socket.off("rideAccepted");
      socket.off("driverLiveLocation");
      socket.off("rideStarted");
    };
  }
}, [socket]);





  // Stop background location tracking
  const stopBackgroundLocationTracking = useCallback(() => {
    console.log("🛑 Stopping background location tracking");
   
    if (geolocationWatchId.current) {
      Geolocation.clearWatch(geolocationWatchId.current);
      geolocationWatchId.current = null;
    }
   
    if (backgroundLocationInterval.current) {
      clearInterval(backgroundLocationInterval.current);
      backgroundLocationInterval.current = null;
    }
   
    setBackgroundTrackingActive(false);
  }, []);

  // ============ CRITICAL FIX: Notification Listener Setup ============
  const showRideAlert = (rideData: RideType) => {
    if (!isMounted.current) {
      console.log('❌ Component not mounted');
      return;
    }
    
    console.log('🎯 DISPLAYING RIDE REQUEST ALERT NOW');
    
    const alertMessage = `🚗 ${rideData.vehicleType?.toUpperCase() || 'TAXI'}\n\n` +
      `📍 Pickup:\n${rideData.pickup.address}\n\n` +
      `🎯 Drop-off:\n${rideData.drop.address}\n\n` +
      `💰 Fare: ₹${rideData.fare}\n` +
      `📏 Distance: ${rideData.distance}\n` +
      `👤 Customer: ${rideData.userName}\n` +
      `📱 Phone: ${rideData.userMobile}`;
    
    Alert.alert(
      "🚖 NEW RIDE REQUEST!",
      alertMessage,
      [
        {
          text: "❌ REJECT",
          onPress: () => {
            console.log('👎 User rejected ride');
            rejectRide(rideData.rideId);
          },
          style: "destructive",
        },
        {
          text: "✅ ACCEPT",
          onPress: () => {
            console.log('👍 User accepted ride');
            acceptRide(rideData.rideId);
          },
          style: "default",
        },
      ],
      { cancelable: false }
    );
  };

  
  const handleNotificationRideRequest = useCallback((data: any) => {
    console.log('🔔 handleNotificationRideRequest called with data:', data?.rideId);
    
    if (!isMounted.current) {
      console.log('❌ Component not mounted, ignoring');
      return;
    }
    
    if (!data?.rideId) {
      console.log('❌ No rideId');
      return;
    }
    
    // Check if we're already processing this ride notification
    if (seenRideNotifications.has(data.rideId)) {
      console.log('🔄 Duplicate ride request, ignoring:', data.rideId);
      return;
    }
    
    // Mark the notification as seen (only for de-duping alerts)
    setSeenRideNotifications(prev => new Set([...prev, data.rideId]));
    
    // Clear from processed rides after 30 seconds
    setTimeout(() => {
      setSeenRideNotifications(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.rideId);
        return newSet;
      });
    }, 30000);

    if (!isDriverOnline) {
      console.log('❌ Driver not online');
      return;
    }
    
    console.log('📊 Driver vehicle:', driverVehicleType);
    console.log('📋 Ride vehicle:', data.vehicleType);
    
    // Vehicle type check
    if (data.vehicleType && driverVehicleType) {
      if (data.vehicleType.toLowerCase() !== driverVehicleType.toLowerCase()) {
        console.log(`🚫 VEHICLE MISMATCH - Ignoring`);
        return;
      }
    }
    
    try {
      let pickupLocation, dropLocation;
      
      try {
        pickupLocation = typeof data.pickup === 'string' ? JSON.parse(data.pickup) : data.pickup;
        dropLocation = typeof data.drop === 'string' ? JSON.parse(data.drop) : data.drop;
      } catch (error) {
        console.error('❌ Location parse error:', error);
        return;
      }
      
      if (!pickupLocation || !dropLocation) {
        console.log('❌ Missing locations');
        return;
      }
      
      const rideData: RideType = {
        rideId: data.rideId,
        RAID_ID: data.RAID_ID || data.rideId || "N/A",
        otp: data.otp || "0000",
        pickup: {
          latitude: pickupLocation?.lat || pickupLocation?.latitude || 0,
          longitude: pickupLocation?.lng || pickupLocation?.longitude || 0,
          address: pickupLocation?.address || "Unknown",
        },
        drop: {
          latitude: dropLocation?.lat || dropLocation?.latitude || 0,
          longitude: dropLocation?.lng || dropLocation?.longitude || 0,
          address: dropLocation?.address || "Unknown",
        },
        fare: parseFloat(data.fare) || 0,
        distance: data.distance || "0 km",
        vehicleType: data.vehicleType || driverVehicleType,
        userName: data.userName || "Customer",
        userMobile: data.userMobile || "N/A",
      };
      
      console.log('✅ Ride data created:', rideData.rideId);
      
      // Use setTimeout to ensure React state updates are complete before showing alert
      setTimeout(() => {
        if (!isMounted.current) return;
        
        // Set ride data
        setRide(rideData);
        setRideStatus("onTheWay");
        console.log('📝 State updated');
        
        // Use requestAnimationFrame to ensure UI is ready
        requestAnimationFrame(() => {
          if (!isMounted.current) return;
          
          // Show alert with debounce
          const showAlert = () => {
            if (!isMounted.current) return;
            
            console.log('🎯 DISPLAYING RIDE REQUEST ALERT NOW');
            
            const alertMessage = `🚗 ${rideData.vehicleType?.toUpperCase() || 'TAXI'}\n\n` +
              `📍 Pickup:\n${rideData.pickup.address}\n\n` +
              `🎯 Drop-off:\n${rideData.drop.address}\n\n` +
              `💰 Fare: ₹${rideData.fare}\n` +
              `📏 Distance: ${rideData.distance}\n` +
              `👤 Customer: ${rideData.userName}\n` +
              `📱 Phone: ${rideData.userMobile}`;
            
            Alert.alert(
              "🚖 NEW RIDE REQUEST!",
              alertMessage,
              [
                {
                  text: "❌ REJECT",
                  onPress: () => {
                    console.log('👎 User rejected ride');
                    rejectRide(rideData.rideId);
                  },
                  style: "destructive",
                },
                {
                  text: "✅ ACCEPT",
                  onPress: () => {
                    console.log('👍 User accepted ride');
                    // Use setTimeout to defer state changes
                    setTimeout(() => {
                      if (isMounted.current) {
                        acceptRide(rideData.rideId);
                      }
                    }, 100);
                  },
                  style: "default",
                },
              ],
              { cancelable: false }
            );
          };
          
          // Delay alert slightly to ensure proper mounting
          setTimeout(showAlert, 150);
        });
      }, 100);
      
    } catch (error) {
      console.error("❌ Error in handler:", error);
      // Remove from processed rides on error
      setSeenRideNotifications(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.rideId);
        return newSet;
      });
    }
  }, [isDriverOnline, driverVehicleType, seenRideNotifications, rejectRide, acceptRide]);



useEffect(() => {
  console.log('📡 === NOTIFICATION SETUP EFFECT ===');
  console.log('driverStatus:', driverStatus);
  console.log('driverId:', driverId);
  console.log('driverVehicleType:', driverVehicleType);
  
  // Add this check to handle both 'online' and 'Live' status
  const isDriverOnline = driverStatus === 'online' || driverStatus === 'Live';
  
  if (!isDriverOnline) { // <-- Change this condition
    console.log('❌ Driver not online, skipping setup');
    return;
  }
  
  if (!driverId || !driverVehicleType) {
    console.log('❌ Missing driverId or vehicleType');
    return;
  }
    
    const setupNotifications = async () => {
      console.log('🔔 Initializing notification system...');
      
      try {
        const initialized = await NotificationService.initializeNotifications();
        
        if (!initialized) {
          console.log('❌ Notification init failed');
          return;
        }
        
        console.log('✅ Notification system ready');
        
        const token = await NotificationService.getFCMToken();
        if (token) {
          console.log('✅ FCM token obtained');
          await sendFCMTokenToServer(token);
        }
        
        console.log('🧹 Cleaning old listeners');
        NotificationService.off('rideRequest', handleNotificationRideRequest);
        
        console.log('📡 Adding rideRequest listener');
        NotificationService.on('rideRequest', handleNotificationRideRequest);
        
        NotificationService.on('tokenRefresh', async (newToken) => {
          console.log('🔄 Token refreshed');
          await sendFCMTokenToServer(newToken);
        });
        
        setHasNotificationPermission(true);
        console.log('✅ Notification setup complete');
        
      } catch (error) {
        console.error('❌ Setup error:', error);
      }
    };
    
    setupNotifications();
    
    return () => {
      console.log('🧹 Cleanup: removing notification listener');
      NotificationService.off('rideRequest', handleNotificationRideRequest);
    };
  }, [driverStatus, driverId, driverVehicleType, handleNotificationRideRequest]);

  // FCM: Send token to server
  const sendFCMTokenToServer = async (token: string): Promise<boolean> => {
    try {
      const authToken = await AsyncStorage.getItem("authToken");
      if (!authToken) {
        console.log('❌ No auth token available');
        return false;
      }
      console.log('📤 Sending FCM token to server...');
     
      const response = await fetch(`${API_BASE}/drivers/update-fcm-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          driverId: driverId,
          fcmToken: token,
          platform: Platform.OS
        }),
      });
     
      console.log('📡 Response status:', response.status);
     
      if (response.ok) {
        const result = await response.json();
        console.log('✅ FCM token updated on server:', result);
        return true;
      } else {
        const errorText = await response.text();
        console.log('❌ Server error:', response.status, errorText);
        return false;
      }
    } catch (error) {
      console.error('❌ Network error sending token:', error);
      return false;
    }
  };

  // Update driver status in DB
  const updateDriverStatusInDB = async (status: string, vehicleType: string) => {
    try {
      const authToken = await AsyncStorage.getItem("authToken");
      if (!authToken || !driverId) return;
      
      await fetch(`${API_BASE}/api/drivers/update-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          driverId,
          status,
          vehicleType,
          location: location ? {
            latitude: location.latitude,
            longitude: location.longitude
          } : null
        }),
      });
    } catch (error) {
      console.error('❌ Error updating driver status:', error);
    }
  };

  // Register driver with socket
  const registerDriverWithSocket = useCallback(() => {
    if (!isMounted.current || !driverId || !location || !socket || !isDriverOnline) return;

    console.log(`📝 Registering driver with socket: ${driverId}`);
    
    const vehicleTypeToSend = driverVehicleType || "taxi";
    
    console.log(`🚗 SOCKET REGISTRATION Vehicle: ${vehicleTypeToSend}`);
    
    const driverData = {
      driverId: driverId,
      driverName: driverName,
      latitude: location.latitude,
      longitude: location.longitude,
      vehicleType: vehicleTypeToSend,
    };
    
    socket.emit("registerDriver", driverData);
    setIsRegistered(true);
    
    updateDriverStatusInDB("Live", vehicleTypeToSend);
  }, [driverId, location, isDriverOnline, driverVehicleType, driverName]);

  // Toggle online status
  const toggleOnlineStatus = useCallback(async () => {
    if (isDriverOnline) {
      setIsDriverOnline(false);
      setDriverStatus("offline");
      stopBackgroundLocationTracking();
      
      if (socket && socket.connected) {
        socket.emit("driverOffline", { driverId });
        socket.disconnect();
      }
      
      await AsyncStorage.setItem("driverOnlineStatus", "offline");
      console.log("🔴 Driver is now offline");
    } else {
      try {
        const driverVehicleType = await AsyncStorage.getItem("driverVehicleType");
        console.log("🚗 Checking driver vehicle type:", driverVehicleType);
        
        if (!driverVehicleType) {
          Alert.alert("Error", "Vehicle type not found. Please login again.");
          navigation.replace("LoginScreen");
          return;
        }
        
        setIsDriverOnline(true);
        setDriverStatus("online");
        startBackgroundLocationTracking();
        
        if (socket) {
          if (!socket.connected) {
            socket.connect();
          }
          
          const onConnect = () => {
            registerDriverWithSocket();
            socket.off("connect", onConnect);
          };
          socket.on("connect", onConnect);
        }
        
        await AsyncStorage.setItem("driverOnlineStatus", "online");
        console.log(`🟢 Driver is now online (${driverVehicleType})`);
        
      } catch (error) {
        console.error("❌ Error going online:", error);
        Alert.alert("Error", "Failed to go online. Please try again.");
      }
    }
  }, [isDriverOnline, driverId, startBackgroundLocationTracking, stopBackgroundLocationTracking, registerDriverWithSocket, navigation]);

  // Load driver info on mount
  useEffect(() => {
    const loadDriverInfo = async () => {
      try {
        console.log("🔍 === LOADING COMPLETE DRIVER INFORMATION ===");
        
        const storedDriverId = await AsyncStorage.getItem("driverId");
        const token = await AsyncStorage.getItem("authToken");
        const storedPhone = await AsyncStorage.getItem("driverPhone");
        
        if (!storedPhone) {
          console.log("❌ No phone number stored, using fallback");
          throw new Error("Phone number not available");
        }
        
        console.log(`📞 Using phone to fetch driver data: ${storedPhone}`);
        
        const response = await fetch(`${API_BASE}/api/auth/get-complete-driver-info`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phoneNumber: storedPhone }),
        });
        
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.driver) {
          console.log("✅ Driver data fetched successfully");
          
          setDriverId(data.driver.driverId);
          setDriverName(data.driver.name);
          setDriverVehicleType(data.driver.vehicleType || "taxi");
          
          await AsyncStorage.multiSet([
            ["driverId", data.driver.driverId],
            ["driverName", data.driver.name],
            ["driverVehicleType", data.driver.vehicleType || "taxi"],
            ["driverPhone", storedPhone],
          ]);
          
          console.log("📱 Driver info stored in AsyncStorage");
          
          const savedStatus = await AsyncStorage.getItem("driverOnlineStatus");
          if (savedStatus === "online") {
            setIsDriverOnline(true);
            setDriverStatus("online");
            console.log("🟢 Restored online status from storage");
          }
          
          const restored = await restoreRideState();
          if (restored) {
            console.log("🔄 Active ride restored from storage");
          }
        }
      } catch (error) {
        console.error("❌ Error loading driver info:", error);
        Alert.alert(
          "Error",
          "Could not load driver information. Please login again.",
          [
            {
              text: "OK",
              onPress: () => navigation.replace("LoginScreen"),
            },
          ]
        );
      }
    };
    
    if (!driverId || !driverName) {
      loadDriverInfo();
    }
  }, [driverId, driverName, navigation, restoreRideState]);

  // Optimized location saving
  const saveLocationToDatabase = useCallback(
    async (location: LocationType) => {
      try {
        locationUpdateCount.current++;
        if (locationUpdateCount.current % 3 !== 0) {
          return;
        }
       
        const payload = {
          driverId,
          driverName: driverName || "Unknown Driver",
          latitude: location.latitude,
          longitude: location.longitude,
          vehicleType: "taxi",
          status: driverStatus === "onRide" ? "onRide" : isDriverOnline ? "Live" : "offline",
          rideId: driverStatus === "onRide" ? ride?.rideId : null,
          timestamp: new Date().toISOString(),
        };
        
        const response = await fetch(`${API_BASE}/driver-location/update`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await AsyncStorage.getItem("authToken")}`,
          },
          body: JSON.stringify(payload),
        });
       
        if (!response.ok) {
          const errorText = await response.text();
          console.error("❌ Failed to save location:", errorText);
          return;
        }
        
        if (socket && socket.connected && isDriverOnline) {
          socket.emit('driverLocationUpdate', {
            driverId,
            latitude: location.latitude,
            longitude: location.longitude,
            status: driverStatus === "onRide" ? "onRide" : "Live",
            rideId: driverStatus === "onRide" ? ride?.rideId : null,
          });
        }
      } catch (error) {
        console.error("❌ Error saving location to DB:", error);
      }
    },
    [driverId, driverName, driverStatus, ride?.rideId, isDriverOnline]
  );

  // Route fetching with real-time updates
  const fetchRoute = useCallback(
    async (origin: LocationType, destination: LocationType) => {
      try {
        console.log("🗺️ Fetching route between:", {
          origin: { lat: origin.latitude, lng: origin.longitude },
          destination: { lat: destination.latitude, lng: destination.longitude },
        });
       
        const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();
       
        if (data.routes && data.routes.length > 0) {
          const coords = data.routes[0].geometry.coordinates.map(
            ([lng, lat]: number[]) => ({
              latitude: lat,
              longitude: lng,
            })
          );
          console.log("✅ Route fetched, coordinates count:", coords.length);
          return coords;
        }
      } catch (error) {
        console.error("❌ Error fetching route:", error);
        return [origin, destination];
      }
    },
    []
  );
  
  // Find nearest point on route
  const findNearestPointOnRoute = useCallback(
    (currentLocation: LocationType, routeCoords: LocationType[]) => {
      if (!routeCoords || routeCoords.length === 0) return null;
     
      let minDistance = Infinity;
      let nearestIndex = 0;
     
      for (let i = 0; i < routeCoords.length; i++) {
        const distance = haversine(currentLocation, routeCoords[i]);
        if (distance < minDistance) {
          minDistance = distance;
          nearestIndex = i;
        }
      }
     
      return { index: nearestIndex, distance: minDistance };
    },
    []
  );

  // Update visible route as driver moves
  const updateVisibleRoute = useCallback(() => {
    if (!location || !fullRouteCoords.length) return;
   
    const nearestPoint = findNearestPointOnRoute(location, fullRouteCoords);
    if (!nearestPoint) return;
   
    const remainingRoute = fullRouteCoords.slice(nearestPoint.index);
  
    if (remainingRoute.length > 0) {
      const updatedRoute = [location, ...remainingRoute];
      setVisibleRouteCoords(updatedRoute);
      setNearestPointIndex(nearestPoint.index);
    }
  }, [location, fullRouteCoords, findNearestPointOnRoute]);
  
  // Throttled route update
  const throttledUpdateVisibleRoute = useCallback(() => {
    if (routeUpdateThrottle.current) {
      clearTimeout(routeUpdateThrottle.current);
    }
   
    routeUpdateThrottle.current = setTimeout(() => {
      updateVisibleRoute();
    }, 500);
  }, [updateVisibleRoute]);
  
  // Automatically update route as driver moves
  useEffect(() => {
    if (rideStatus === "started" && fullRouteCoords.length > 0) {
      throttledUpdateVisibleRoute();
    }
  }, [location, rideStatus, fullRouteCoords, throttledUpdateVisibleRoute]);
  
  // Update pickup route as driver moves
  const updatePickupRoute = useCallback(async () => {
    if (!location || !ride || rideStatus !== "accepted") return;
    
    console.log("🗺️ Updating pickup route as driver moves");
    
    try {
      const pickupRoute = await fetchRoute(location, ride.pickup);
      if (pickupRoute && pickupRoute.length > 0) {
        setRide((prev) => {
          if (!prev) return null;
          console.log("✅ Updated pickup route with", pickupRoute.length, "points");
          return { ...prev, routeCoords: pickupRoute };
        });
      }
    } catch (error) {
      console.error("❌ Error updating pickup route:", error);
    }
  }, [location, ride, rideStatus, fetchRoute]);
  
  // Throttled pickup route update
  const throttledUpdatePickupRoute = useCallback(() => {
    if (routeUpdateThrottle.current) {
      clearTimeout(routeUpdateThrottle.current);
    }
   
    routeUpdateThrottle.current = setTimeout(() => {
      updatePickupRoute();
    }, 2000);
  }, [updatePickupRoute]);
  
  // Update pickup route as driver moves
  useEffect(() => {
    if (rideStatus === "accepted" && location && ride) {
      throttledUpdatePickupRoute();
    }
  }, [location, rideStatus, ride, throttledUpdatePickupRoute]);
  
  // Update drop route as driver moves after OTP
  const updateDropRoute = useCallback(async () => {
    if (!location || !ride || rideStatus !== "started") return;
    
    console.log("🗺️ Updating drop route as driver moves after OTP");
    
    try {
      const dropRoute = await fetchRoute(location, ride.drop);
      if (dropRoute && dropRoute.length > 0) {
        setFullRouteCoords(dropRoute);
        setVisibleRouteCoords(dropRoute);
        console.log("✅ Updated drop route with", dropRoute.length, "points");
      }
    } catch (error) {
      console.error("❌ Error updating drop route:", error);
    }
  }, [location, ride, rideStatus, fetchRoute]);
  
  // Throttled drop route update
  const throttledUpdateDropRoute = useCallback(() => {
    if (routeUpdateThrottle.current) {
      clearTimeout(routeUpdateThrottle.current);
    }
   
    routeUpdateThrottle.current = setTimeout(() => {
      updateDropRoute();
    }, 3000);
  }, [updateDropRoute]);
  
  // Update drop route as driver moves
  useEffect(() => {
    if (rideStatus === "started" && location && ride) {
      throttledUpdateDropRoute();
    }
  }, [location, rideStatus, ride, throttledUpdateDropRoute]);
  
const animateToLocation = useCallback(
  (targetLocation: LocationType, shouldIncludeUser: boolean = false) => {
    if (!mapRef.current || mapAnimationInProgress.current) return;
   
    try {
      mapAnimationInProgress.current = true;
      let region = {
        latitude: targetLocation.latitude || 0,
        longitude: targetLocation.longitude || 0,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

      
      if (shouldIncludeUser && userLocation && location) {
        const points = [location, userLocation, targetLocation];
        const lats = points.map((p) => p.latitude);
        const lngs = points.map((p) => p.longitude);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        const midLat = (minLat + maxLat) / 2;
        const midLng = (minLng + maxLng) / 2;
        const latDelta = (maxLat - minLat) * 1.2;
        const lngDelta = (maxLng - minLng) * 1.2;
       
        region = {
          latitude: midLat,
          longitude: midLng,
          latitudeDelta: Math.max(latDelta, 0.02),
          longitudeDelta: Math.max(lngDelta, 0.02),
        };
      }
      
      setMapRegion(region);
      mapRef.current.animateToRegion(region, 1000);
     
       setTimeout(() => {
        mapAnimationInProgress.current = false;
      }, 1000);
    } catch (error) {
      console.error("Map animation error:", error);
      mapAnimationInProgress.current = false;
    }
  },
  [userLocation, location]
);
  // Start navigation (called after OTP verification)
  const startNavigation = useCallback(async () => {
    if (!ride?.drop) return;
    console.log("🚀 Starting navigation from OTP verification location to drop location");
  
    try {
      const routeCoords = await fetchRoute(otpVerificationLocation || location!, ride.drop);
      if (routeCoords && routeCoords.length > 0) {
        console.log("✅ Navigation route fetched successfully:", routeCoords.length, "points");
      
        setFullRouteCoords(routeCoords);
        setVisibleRouteCoords(routeCoords);
      
        if (navigationInterval.current) clearInterval(navigationInterval.current);
        navigationInterval.current = setInterval(async () => {
          if (rideStatus === "started" && location) {
            console.log("🔄 Re-fetching optimized route from current location to drop");
            const updatedRoute = await fetchRoute(location, ride.drop);
            if (updatedRoute && updatedRoute.length > 0) {
              setFullRouteCoords(updatedRoute);
              setVisibleRouteCoords(updatedRoute);
            }
          }
        }, 10000);
      
        console.log("🗺️ Navigation started with real-time route updates from current location to drop");
      }
    } catch (error) {
      console.error("❌ Error starting navigation:", error);
    }
  }, [ride?.drop, fetchRoute, otpVerificationLocation, location, rideStatus]);


  useEffect(() => {
    return () => {
      isMounted.current = false;
      // Clear all timeouts and intervals
      if (navigationInterval.current) clearInterval(navigationInterval.current);
      if (routeUpdateThrottle.current) clearTimeout(routeUpdateThrottle.current);
      if (geolocationWatchId.current) Geolocation.clearWatch(geolocationWatchId.current);
      if (backgroundLocationInterval.current) clearInterval(backgroundLocationInterval.current);
      if (rideTakenAlertTimeout.current) clearTimeout(rideTakenAlertTimeout.current);
      
      // Remove all listeners
      NotificationService.off('rideRequest', handleNotificationRideRequest);
      NotificationService.off('tokenRefresh', () => {});
    };
  }, []);

  // Stop navigation
  const stopNavigation = useCallback(() => {
    console.log("🛑 Stopping navigation mode");
    if (navigationInterval.current) {
      clearInterval(navigationInterval.current);
      navigationInterval.current = null;
    }
  }, []);
  
  // Logout function
  const handleLogout = async () => {
    try {
      console.log("🚪 Initiating logout for driver:", driverId);
     
      if (ride) {
        Alert.alert(
          "Active Ride",
          "Please complete your current ride before logging out.",
          [{ text: "OK" }]
        );
        return;
      }
      
      stopBackgroundLocationTracking();
      
      await api.post("/drivers/logout");
      await AsyncStorage.clear();
      console.log("✅ AsyncStorage cleared");
      
      if (socket) {
        socket.disconnect();
      }
      
      navigation.replace("LoginScreen");
      console.log("🧭 Navigated to LoginScreen");
    } catch (err) {
      console.error("❌ Error during logout:", err);
      Alert.alert("❌ Logout Error", "Failed to logout. Please try again.");
    }
  };


  

  const attemptAcceptRideRequest = async (payload: any) => {
  try {
    // Use the correct endpoint path
    const res = await api.post("/drivers/accept-ride", payload);
    
    return {
      ok: !!(res?.data?.success ?? res?.success),
      data: res?.data?.ride ?? res?.ride ?? null,
      message: res?.data?.message ?? res?.message ?? null,
      status: res?.status ?? 200
    };
  } catch (axiosErr: any) {
    console.warn("⚠️ axios accept ride error:", axiosErr?.message ?? axiosErr);
    
    // Try with the correct endpoint
    try {
      const authToken = await AsyncStorage.getItem("authToken");
      
      // CORRECTED: Remove duplicate /api prefix
      const fetchRes = await fetch(`${API_BASE}/drivers/accept-ride`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!fetchRes.ok) {
        const text = await fetchRes.text().catch(() => String(fetchRes.status));
        return {
          ok: false,
          data: null,
          message: text || `HTTP ${fetchRes.status}`,
          status: fetchRes.status
        };
      }

      const json = await fetchRes.json().catch(() => null);
      return {
        ok: !!(json?.success ?? json?.data?.success ?? true),
        data: json?.data?.ride ?? json?.ride ?? null,
        message: json?.message ?? null,
        status: fetchRes.status
      };
    } catch (fetchErr) {
      console.error("❌ acceptRide fetch fallback failed:", fetchErr);
      return {
        ok: false,
        data: null,
        message: "Network error",
        status: 0
      };
    }
  }
};



const acceptRide = async (rideId?: string) => {
  const currentRideId = rideId || ride?.rideId;
  if (!currentRideId) {
    Alert.alert("Error", "No ride ID available. Please try again.");
    return;
  }

  if (isLoading) return;
  setIsLoading(true);

  try {
    console.log('🟢 Attempting to accept ride:', currentRideId);

    const payload = {
      driverId,
      rideId: currentRideId,
      driverName: driverName,
      vehicleType: driverVehicleType,
    };

    // Send socket request to accept ride
    socket.emit("acceptRide", payload, (response) => {
      console.log('📨 Server response:', response);
      
      if (response.success) {
        console.log("✅ Ride accepted successfully");
        
        // Update local state
        setRide({
          rideId: currentRideId,
          RAID_ID: response.rideId || currentRideId,
          otp: response.otp || "0000",
          pickup: {
            latitude: response.pickup?.lat || 0,
            longitude: response.pickup?.lng || 0,
            address: response.pickup?.addr || "Pickup location"
          },
          drop: {
            latitude: response.drop?.lat || 0,
            longitude: response.drop?.lng || 0,
            address: response.drop?.addr || "Drop location"
          },
          fare: response.fare || 0,
          distance: response.distance || "0 km",
          vehicleType: response.vehicleType || driverVehicleType,
          userName: response.userName || "Customer",
          userMobile: response.userMobile || "N/A"
        });
        

        setUserData({
  name: response.userName || "Passenger",
  mobile: response.userMobile || response.userPhone || "Contact Admin",
  location: {
    latitude: response.pickup?.lat || 0,
    longitude: response.pickup?.lng || 0
  },
  userId: response.userId,
  userPhone: response.userMobile || response.userPhone // Add this
});



        
        setRideStatus("accepted");
        setDriverStatus("onRide");
        
        Alert.alert(
          "Ride Accepted ✅", 
          "You have accepted the ride. Navigate to pickup.",
          [{ text: "OK" }]
        );
        
      } else {
        // Handle different error scenarios
        if (response.conflict || response.message?.includes("already")) {
          Alert.alert(
            "Ride Already Taken",
            `This ride has been accepted by ${response.currentDriver || 'another driver'}.`,
            [{ 
              text: "OK", 
              onPress: () => {
                // Clear the UI immediately
                setRide(null);
                setRideStatus("idle");
                setDriverStatus("online");
                clearMapData();
                
                // Also emit event to clear from seen notifications
                socket.emit("rideTakenNotificationCleared", {
                  rideId: currentRideId,
                  driverId: driverId
                });
              }
            }]
          );
        } else {
          Alert.alert("Failed", response.message || "Failed to accept ride");
        }
      }
      
      setIsLoading(false);
    });

  } catch (error) {
    console.error("❌ acceptRide error:", error);
    Alert.alert("Error", "Failed to accept ride. Please try again.");
    setIsLoading(false);
  }
};

// Add this useEffect to handle rideTakenByOther events
useEffect(() => {
  const handleRideTakenByOther = (data) => {
    console.log('🚫 Ride taken by other:', data);
    
    if (data.rideId === ride?.rideId) {
      Alert.alert(
        "Ride Already Taken",
        `This ride has been accepted by ${data.takenBy || 'another driver'}.`,
        [{ 
          text: "OK", 
          onPress: () => {
            // Clear everything
            setRide(null);
            setRideStatus("idle");
            setDriverStatus("online");
            clearMapData();
            hideRiderDetails();
          }
        }]
      );
    }
  };

  // Listen for ride taken events
  socket?.on("rideTakenByOther", handleRideTakenByOther);
  
  return () => {
    socket?.off("rideTakenByOther", handleRideTakenByOther);
  };
}, [socket, ride?.rideId]);




// Add this useEffect to continuously send driver location to user
useEffect(() => {
  if (rideStatus === "accepted" || rideStatus === "started") {
    const locationInterval = setInterval(() => {
      if (location && ride?.rideId && socket) {
        console.log(`📍 Sending driver live location to user:`, {
          latitude: location.latitude,
          longitude: location.longitude
        });
        
        socket.emit("driverLiveLocation", {
          rideId: ride.rideId,
          driverId: driverId,
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: new Date().toISOString()
        });
      }
    }, 3000); // Send every 3 seconds
    
    return () => clearInterval(locationInterval);
  }
}, [rideStatus, location, ride?.rideId, driverId, socket]);



const cleanupAfterRideTaken = useCallback((rideId: string) => {
  console.log(`🧹 Cleaning up after ride ${rideId} was taken by another driver`);
  
  // Use setTimeout to ensure React state updates are complete
  setTimeout(() => {
    // Remove from seen notifications
    setSeenRideNotifications(prev => {
      const newSet = new Set(prev);
      newSet.delete(rideId);
      return newSet;
    });
    
    // Remove from accepting rides
    setAcceptingRideIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(rideId);
      return newSet;
    });
    
    // Clear UI state - but only if it's the same ride
    if (ride?.rideId === rideId) {
      // Reset ride state first
      setRide(null);
      setRideStatus("idle");
      
      // Clear map data after a delay to ensure React has updated
      setTimeout(() => {
        hideRiderDetails();
        clearMapData();
      }, 100);
    }
  }, 0);
}, [ride, clearMapData, hideRiderDetails]);

  // Add to useEffect notification setup

  
  // Update the notification setup to use a more robust handler
NotificationService.on('rideTakenByOther', (data: any) => {
  console.log('🚫 Ride taken by another driver:', data.rideId);
  
  // Use setTimeout to avoid state updates during render
  setTimeout(() => {
    if (data.rideId === ride?.rideId) {
      Alert.alert(
        "Ride Already Taken",
        "This ride has been accepted by another driver.",
        [{ 
          text: "OK", 
          onPress: () => {
            // Delay cleanup to ensure Alert is dismissed
            setTimeout(() => {
              cleanupAfterRideTaken(data.rideId);
            }, 500);
          }
        }]
      );
    }
  }, 100);
});





  const renderRideActions = () => {
    if (!ride) return null;
    
    switch (rideStatus) {
      case "onTheWay":
        return (
          <View style={styles.rideActions} key="on-the-way-actions">
            <TouchableOpacity
              style={[styles.button, styles.acceptButton]}
              onPress={() => acceptRide()}
              disabled={isLoading}
              key="accept-button"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <MaterialIcons name="check-circle" size={24} color="#fff" />
                  <Text style={styles.btnText}>Accept Ride</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.rejectButton]}
              onPress={() => rejectRide()}
              key="reject-button"
            >
              <MaterialIcons name="cancel" size={24} color="#fff" />
              <Text style={styles.btnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        );
        
      case "accepted":
        return (
          <TouchableOpacity
            style={[styles.button, styles.startButton]}
            onPress={() => setOtpModalVisible(true)}
            key="accepted-action"
          >
            <MaterialIcons name="play-arrow" size={24} color="#fff" />
            <Text style={styles.btnText}>Enter OTP & Start Ride</Text>
          </TouchableOpacity>
        );
        
      case "started":
        return (
          <TouchableOpacity
            style={[styles.button, styles.completeButton]}
            onPress={completeRide}
            key="started-action"
          >
            <MaterialIcons name="flag" size={24} color="#fff" />
            <Text style={styles.btnText}>
              Complete Ride ({distanceSinceOtp.current.toFixed(2)} km)
            </Text>
          </TouchableOpacity>
        );
        
      default:
        return null;
    }
  };

  // Reject ride
  const rejectRide = (rideId?: string) => {
    const currentRideId = rideId || ride?.rideId;
    if (!currentRideId) return;
   
    clearMapData();
   
    setRide(null);
    setRideStatus("idle");
    setDriverStatus("online");
    setUserData(null);
    setUserLocation(null);
    hideRiderDetails();
   
    if (socket) {
      socket.emit("rejectRide", {
        rideId: currentRideId,
        driverId,
      });
    }
   
    Alert.alert("Ride Rejected ❌", "You rejected the ride");
  };

  
  const clearMapData = useCallback(() => {
  console.log("🧹 Clearing all map data");
  
  // Clear arrays first
  setFullRouteCoords([]);
  setVisibleRouteCoords([]);
  
  // Reset other states
  setNearestPointIndex(0);
  setUserLocation(null);
  setTravelledKm(0);
  setLastCoord(null);
  distanceSinceOtp.current = 0;
  lastLocationBeforeOtp.current = null;
  setOtpVerificationLocation(null);
 
  // Wait for state to clear before animating
  setTimeout(() => {
    if (location && mapRef.current) {
      try {
        mapRef.current.animateToRegion({
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 1000);
      } catch (error) {
        console.log("Map animation error during cleanup:", error);
      }
    }
  }, 100);
}, [location]);





const confirmOTP = async () => {
  if (!ride) return;
  
  if (!ride.otp) {
    Alert.alert("Error", "OTP not yet received. Please wait...");
    return;
  }
  
  if (enteredOtp === ride.otp) {
    // Store OTP verification location
    setOtpVerificationLocation(location);
    
    // Update ride status
    setRideStatus("started");
    setOtpModalVisible(false);
    setEnteredOtp("");
    
    // ✅ CRITICAL FIX: Send multiple events to ensure user app receives it
    if (socket && ride.rideId) {
      // Send OTP verified event
      socket.emit("otpVerified", {
        rideId: ride.rideId,
        driverId: driverId,
        userId: userData?.userId || ride.rideId,
        timestamp: new Date().toISOString(),
        alertType: "otpVerified"
      });
      
      // Also send rideStarted for backward compatibility
      socket.emit("rideStarted", {
        rideId: ride.rideId,
        driverId: driverId,
        userId: userData?.userId || ride.rideId,
        timestamp: new Date().toISOString(),
        alertType: "rideStarted"
      });
      
      // Update ride status on server
      socket.emit("updateRideStatus", {
        rideId: ride.rideId,
        status: "started",
        otpVerified: true
      });
      
      console.log("✅ All OTP verification events sent");
    }
    
    // Start navigation
    if (ride.drop) {
      await startNavigation();
      animateToLocation(ride.drop, true);
    }
    
    // Show confirmation to driver
    Alert.alert(
      "✅ OTP Verified",
      "Ride started successfully. Navigation to drop location activated.",
      [{ text: "OK" }]
    );
    
  } else {
    Alert.alert("Invalid OTP", "Please check the OTP and try again.");
  }
};





const completeRide = async () => {
  if (!ride || !location || !otpVerificationLocation) {
    Alert.alert("Error", "Missing required data to complete ride");
    return;
  }
  
  stopNavigation();
  
  try {
    // Calculate actual distance from OTP verification to current location
    const distance = haversine(otpVerificationLocation, location) / 1000;
    
    // Get vehicle type-specific rate from admin
    const farePerKm = ride.fare || (dynamicPrices && dynamicPrices[ride.vehicleType || 'bike']) || 15;
    
    // Calculate final fare: distance × rate
    const finalFare = Math.max(50, Math.round(distance * farePerKm));
    
    console.log(`💰 FARE CALCULATION:`);
    console.log(`   Distance: ${distance.toFixed(2)} km`);
    console.log(`   Rate: ₹${farePerKm}/km`);
    console.log(`   Final Fare: ₹${finalFare}`);
    
    // Send ride completion to server with ACTUAL locations
    if (socket && ride.rideId && driverId && otpVerificationLocation) {
      socket.emit("rideCompleted", {
        rideId: ride.rideId,
        driverId: driverId,
        userId: userData?.userId,
        distance: parseFloat(distance.toFixed(2)),
        fare: finalFare,
        actualPickup: otpVerificationLocation, // OTP verified location
        actualDrop: location, // Current location at completion
        timestamp: new Date().toISOString()
      });
      
      console.log(`📤 Sent ride completion with actual locations`);
    }
    
    // Show bill modal to driver
    setBillDetails({
      distance: `${distance.toFixed(2)} km`,
      travelTime: `${Math.round(distance * 10)} mins`,
      charge: finalFare,
      userName: userData?.name || 'Customer',
      userMobile: 'NA',
      driverName: driverName,
      vehicleType: ride.vehicleType || 'bike',
      baseFare: 0,
      timeCharge: 0,
      tax: 0
    });
    
    setShowBillModal(true);
    
  } catch (error) {
    console.error("❌ Error completing ride:", error);
    Alert.alert("Error", "Failed to complete ride. Please try again.");
  }
};



const handleBillModalClose = () => {
  setShowBillModal(false);
  
  // Reset all ride state
  setRide(null);
  setRideStatus("idle");
  setDriverStatus("online");
  setUserData(null);
  setOtpSharedTime(null);
  setOtpVerificationLocation(null);
  setTravelledKm(0);
  distanceSinceOtp.current = 0;
  lastLocationBeforeOtp.current = null;
  
  // Clear map data
  clearMapData();
  
  // Hide rider details
  hideRiderDetails();
  
  // Clear ride state from storage
  clearRideState();
  
  console.log("✅ Ride completed. Driver is now online and ready for new rides.");
  
  // Show confirmation
  Alert.alert(
    "Ride Completed ✅",
    "You are now back online and ready for new ride requests.",
    [{ text: "OK" }]
  );
};



  
  // Handle verification modal close
  const handleVerificationModalClose = () => {
    setShowVerificationModal(false);
  };

  // Handle ride request
  const handleRideRequest = useCallback((data: any) => {
    if (!isMounted.current || !data?.rideId || !isDriverOnline) {
      console.log('🚫 Ride request ignored:', { 
        mounted: isMounted.current, 
        rideId: data?.rideId,
        isDriverOnline 
      });
      return;
    }
    
    console.log(`🚗 Received ride request for ${data.vehicleType}`);
    console.log(`📊 Driver's vehicle type: ${driverVehicleType}`);
    
    if (data.vehicleType && driverVehicleType && data.vehicleType !== driverVehicleType) {
      console.log(`🚫 Ignoring ride request: Driver is ${driverVehicleType}, ride requires ${data.vehicleType}`);
      return;
    }
    
    setTimeout(() => {
      try {
        let pickupLocation, dropLocation;
        
        try {
          pickupLocation = typeof data.pickup === 'string' 
            ? JSON.parse(data.pickup) 
            : data.pickup;
          
          dropLocation = typeof data.drop === 'string' 
            ? JSON.parse(data.drop) 
            : data.drop;
        } catch (error) {
          console.error('Error parsing location data:', error);
          return;
        }
        
        const rideData: RideType = {
          rideId: data.rideId,
          RAID_ID: data.RAID_ID || "N/A",
          otp: data.otp || "0000",
          pickup: {
            latitude: pickupLocation?.lat || pickupLocation?.latitude || 0,
            longitude: pickupLocation?.lng || pickupLocation?.longitude || 0,
            address: pickupLocation?.address || "Unknown location",
          },
          drop: {
            latitude: dropLocation?.lat || dropLocation?.latitude || 0,
            longitude: dropLocation?.lng || dropLocation?.longitude || 0,
            address: dropLocation?.address || "Unknown location",
          },
          fare: parseFloat(data.fare) || 0,
          distance: data.distance || "0 km",
          vehicleType: data.vehicleType,
          userName: data.userName || "Customer",
          userMobile: data.userMobile || "N/A",
        };
        
        console.log('🎯 SETTING RIDE DATA TO SHOW ACCEPT/REJECT BUTTONS');
        
        setRide(rideData);
        setRideStatus("onTheWay");
        
        setTimeout(() => {
          if (isMounted.current && rideData.rideId) {
            Alert.alert(
              "🚖 New Ride Request!",
              `🚗 Vehicle: ${rideData.vehicleType?.toUpperCase() || 'TAXI'}\n📍 Pickup: ${rideData.pickup.address}\n🎯 Drop: ${rideData.drop.address}\n💰 Fare: ₹${rideData.fare}\n📏 Distance: ${rideData.distance}\n👤 Customer: ${rideData.userName}`,
              [
                {
                  text: "❌ Reject",
                  onPress: () => rejectRide(rideData.rideId),
                  style: "destructive",
                },
                {
                  text: "✅ Accept",
                  onPress: () => acceptRide(rideData.rideId),
                },
              ],
              { cancelable: false }
            );
            console.log('✅ Ride alert shown successfully');
          }
        }, 500);
        
      } catch (error) {
        console.error("❌ Error processing ride request:", error);
        Alert.alert("Error", "Could not process ride request. Please try again.");
      }
    }, 100);
  }, [isDriverOnline, driverVehicleType, rejectRide, acceptRide]);

  // Check for pending rides
  const checkForPendingRides = useCallback(async () => {
    try {
      if (!isDriverOnline || !driverId) return;
      
      console.log('🔍 Checking for pending rides...');
      
      const authToken = await AsyncStorage.getItem("authToken");
      if (!authToken) return;
      
      const response = await fetch(`${API_BASE}/api/drivers/pending-rides/${driverId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.pendingRides && data.pendingRides.length > 0) {
          console.log(`📋 Found ${data.pendingRides.length} pending rides`);
          const pendingRide = data.pendingRides[0];
          handleRideRequest(pendingRide);
        }
      }
    } catch (error) {
      console.error('❌ Error checking pending rides:', error);
    }
  }, [isDriverOnline, driverId, handleRideRequest]);

  // Socket setup effect
  useEffect(() => {
    if (!socket) {
      console.warn("⚠️ Socket not available");
      return;
    }
    
    const handleConnect = () => {
      if (!isMounted.current) return;
      setSocketConnected(true);
      
      if (location && driverId && driverName && isDriverOnline && driverVehicleType) {
        registerDriverWithSocket();
      }
    };
    
    const handleNewRideRequest = (data: any) => {
      handleRideRequest(data);
    };
    
    socket.on("connect", handleConnect);
    socket.on("newRideRequest", handleNewRideRequest);
    
    return () => {
      socket.off("connect", handleConnect);
      socket.off("newRideRequest", handleNewRideRequest);
    };
  }, [socket, location, driverId, driverName, isDriverOnline, driverVehicleType, handleRideRequest]);

  // Location tracking effect
  useEffect(() => {
    let watchId: number | null = null;

    const requestLocation = async () => {
      try {
        if (Platform.OS === "android" && !location) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: "Location Permission",
              message: "This app needs access to your location for ride tracking",
              buttonNeutral: "Ask Me Later",
              buttonNegative: "Cancel",
              buttonPositive: "OK"
            }
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert("Permission Required", "Location permission is required to go online");
            return;
          }
        }

        if (!location) return;
        watchId = Geolocation.watchPosition(
          (pos) => {
            if (!isMounted.current || !isDriverOnline) return;

            const loc: LocationType = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };

            setLocation(loc);
            setCurrentSpeed(pos.coords.speed || 0);
            lastLocationUpdate.current = loc;

            if (lastCoord && (rideStatus === "accepted" || rideStatus === "started")) {
              const dist = haversine(lastCoord, loc);
              const distanceKm = dist / 1000;
              setTravelledKm((prev) => prev + distanceKm);

              if (rideStatus === "started" && lastLocationBeforeOtp.current) {
                distanceSinceOtp.current += distanceKm;
              }
            }
            setLastCoord(loc);

            if (locationUpdateCount.current % 10 === 0 && mapRef.current && !ride) {
              mapRef.current.animateToRegion(
                {
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                },
                500
              );
            }

            saveLocationToDatabase(loc).catch(console.error);
          },
          (err) => {
            console.error("Geolocation error:", err);
          },
          {
            enableHighAccuracy: true,
            distanceFilter: 5,
            interval: 3000,
            fastestInterval: 2000,
          }
        );
      } catch (e) {
        console.error("Location setup error:", e);
      }
    };

    if (isDriverOnline) requestLocation();

    return () => {
      if (watchId !== null) Geolocation.clearWatch(watchId);
    };
  }, [isDriverOnline, location, rideStatus, lastCoord, saveLocationToDatabase]);

  // Save ride state whenever it changes
  useEffect(() => {
    if (ride && (rideStatus === "accepted" || rideStatus === "started")) {
      saveRideState();
    }
  }, [ride, rideStatus, userData, travelledKm, otpVerificationLocation, riderDetailsVisible, saveRideState]);

  // Render professional maximized passenger details
  const renderMaximizedPassengerDetails = () => {
    if (!ride || !userData || !riderDetailsVisible) return null;

    return (
      <Animated.View 
        style={[
          styles.maximizedDetailsContainer,
          {
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim
          }
        ]}
      >
        <View style={styles.maximizedHeader}>
          <View style={styles.brandingContainer}>
            <Text style={styles.brandingText}>Webase branding</Text>
          </View>
          <TouchableOpacity onPress={hideRiderDetails} style={styles.minimizeButton}>
            <MaterialIcons name="keyboard-arrow-down" size={28} color="#666" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.maximizedContent} showsVerticalScrollIndicator={false}>
          <View style={styles.contactSection}>
            <View style={styles.contactRow}>
              <MaterialIcons name="phone" size={20} color="#666" />
              <Text style={styles.contactLabel}>Phone</Text>
              <Text style={styles.contactValue}>{ride.userMobile}</Text>
            </View>
          </View>

          <View style={styles.addressSection}>
            <View style={styles.addressRow}>
              <MaterialIcons name="location-on" size={20} color="#666" />
              <Text style={styles.addressLabel}>Pick-up location</Text>
            </View>
            <Text style={styles.addressText}>
              {ride.pickup.address}
            </Text>
            
            <View style={[styles.addressRow, { marginTop: 16 }]}>
              <MaterialIcons name="location-on" size={20} color="#666" />
              <Text style={styles.addressLabel}>Drop-off location</Text>
            </View>
            <Text style={styles.addressText}>
              {ride.drop.address}
            </Text>
          </View>

          <View style={styles.fareSection}>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Estimated fare</Text>
              <Text style={styles.fareAmount}>₹{ride.fare}</Text>
            </View>
          </View>
        </ScrollView>

        <TouchableOpacity 
          style={styles.startRideButton}
          onPress={() => setOtpModalVisible(true)}
        >
          <Text style={styles.startRideButtonText}>Enter OTP & Start Ride</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // Render minimized booking bar
  const renderMinimizedBookingBar = () => {
    if (!ride || !userData || riderDetailsVisible) return null;

    return (
      <View style={styles.minimizedBookingBarContainer}>
        <View style={styles.minimizedBookingBar}>
          <View style={styles.minimizedFirstRow}>
            <View style={styles.minimizedProfileImage}>
              <Text style={styles.minimizedProfileImageText}>
                {calculateInitials(userData.name)}
              </Text>
            </View>
            <Text style={styles.minimizedProfileName} numberOfLines={1}>
              {userData.name}
            </Text>
            <TouchableOpacity 
              style={styles.minimizedExpandButton}
              onPress={showRiderDetails}
            >
              <MaterialIcons name="keyboard-arrow-up" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.minimizedSecondRow}>
            <View style={styles.minimizedMobileContainer}>
              <MaterialIcons name="phone" size={16} color="#4CAF50" />
              <Text style={styles.minimizedMobileText} numberOfLines={1}>
                {userData.mobile}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.minimizedCallButton}
              onPress={handleCallPassenger}
            >
              <MaterialIcons name="call" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // UI Rendering
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => setError(null)}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4caf50" />
        <Text style={styles.loadingText}>Fetching your location...</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            Geolocation.getCurrentPosition(
              (pos) => {
                setLocation({
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                });
              },
              (err) => {
                Alert.alert(
                  "Location Error",
                  "Could not get your location. Please check GPS settings."
                );
              },
              { enableHighAccuracy: true, timeout: 15000 }
            );
          }}
        >
          <Text style={styles.retryText}>Retry Location</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  return (
    <View style={styles.container} key="main-container">
      <MapView
        ref={mapRef}
        style={styles.map}
        key="map-view"
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation
        showsMyLocationButton
        showsCompass={true}
        showsScale={true}
        zoomControlEnabled={true}
        rotateEnabled={true}
        scrollEnabled={true}
        zoomEnabled={true}
        region={mapRegion}
      >
        
        

       

{ride && rideStatus !== "started" && ride.pickup && (
  <Marker
    coordinate={{
      latitude: ride.pickup.latitude || 0,
      longitude: ride.pickup.longitude || 0
    }}
    title="Pickup Location"
    description={ride.pickup.address || "Pickup"}
    pinColor="blue"
    key="pickup-marker"
  >
    <View style={styles.locationMarker}>
      <MaterialIcons name="location-pin" size={32} color="#2196F3" />
      <Text style={styles.markerLabel}>Pickup</Text>
    </View>
  </Marker>
)}

{ride && ride.drop && (
  <Marker
    coordinate={{
      latitude: ride.drop.latitude || 0,
      longitude: ride.drop.longitude || 0
    }}
    title="Drop Location"
    description={ride.drop.address || "Drop"}
    pinColor="red"
    key="drop-marker"
  >
    <View style={styles.locationMarker}>
      <MaterialIcons name="location-pin" size={32} color="#F44336" />
      <Text style={styles.markerLabel}>Drop-off</Text>
    </View>
  </Marker>
)}

  {rideStatus === "accepted" && ride?.routeCoords && ride.routeCoords.length > 1 && (
    <Polyline
      coordinates={ride.routeCoords}
      strokeWidth={5}
      strokeColor="#4CAF50"
      lineCap="round"
      lineJoin="round"
    />
  )}
  
  {/* Navigation route (red) after OTP verification */}
  {rideStatus === "started" && visibleRouteCoords.length > 1 && (
    <Polyline
      coordinates={visibleRouteCoords}
      strokeWidth={6}
      strokeColor="#F44336"
      lineCap="round"
      lineJoin="round"
    />
  )}
  
  {/* Pickup marker - hide after OTP verification */}
  {ride && rideStatus !== "started" && ride.pickup && (
    <Marker
      coordinate={{
        latitude: ride.pickup.latitude,
        longitude: ride.pickup.longitude
      }}
      title="Pickup Location"
      description={ride.pickup.address}
    >
      <View style={styles.locationMarker}>
        <MaterialIcons name="location-pin" size={32} color="#2196F3" />
      </View>
    </Marker>
  )}
  
  {/* Drop marker - always show */}
  {ride && ride.drop && (
    <Marker
      coordinate={{
        latitude: ride.drop.latitude,
        longitude: ride.drop.longitude
      }}
      title="Drop Location"
      description={ride.drop.address}
    >
      <View style={styles.locationMarker}>
        <MaterialIcons name="location-pin" size={32} color="#F44336" />
      </View>
    </Marker>
  )}

      </MapView>

      {/* Vehicle type badge: moved outside MapView to avoid Android SurfaceMountingManager addViewAt errors */}
      {driverVehicleType ? (
        <View style={[styles.vehicleTypeBadge, { zIndex: 1000, elevation: 10 }]} key="vehicle-type-badge-overlay">
          <Text style={styles.vehicleTypeText}>🚗 {driverVehicleType.toUpperCase()}</Text>
        </View>
      ) : null}
      
      {renderMaximizedPassengerDetails()}
      {renderMinimizedBookingBar()}
      {renderRideActions()}

      {showRideTakenAlert && (
        <View style={styles.rideTakenAlertContainer} key="ride-taken-alert">
          <View style={styles.rideTakenAlertContent}>
            <Text style={styles.rideTakenAlertText}>
              This ride is already taken by another driver — please wait.
            </Text>
            <View style={styles.alertProgressBar}>
              <Animated.View 
                style={[
                  styles.alertProgressFill,
                  {
                    width: '100%',
                    transform: [{ scaleX: alertProgress }]
                  }
                ]}
              />
            </View>
          </View>
        </View>
      )}
      
      {!ride && (
        <View style={styles.onlineToggleContainer} key="toggle-container">
          <TouchableOpacity
            style={[
              styles.onlineToggleButton,
              isDriverOnline ? styles.onlineButton : styles.offlineButton
            ]}
            onPress={toggleOnlineStatus}
            key="toggle-button"
          >
            <View style={styles.toggleContent}>
              <View style={[
                styles.toggleIndicator,
                { backgroundColor: isDriverOnline ? "#4caf50" : "#f44336" }
              ]} />
              <Text style={styles.toggleButtonText}>
                {isDriverOnline ? "🟢 ONLINE" : "🔴 OFFLINE"}
              </Text>
            </View>
            {backgroundTrackingActive && (
              <Text style={styles.trackingText}>📍 Live tracking active</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      
      <View style={styles.statusContainer} key="status-container">
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusIndicator,
              { backgroundColor: socketConnected ? "#4caf50" : "#f44336" },
            ]}
          />
          <Text style={styles.statusText}>
            {socketConnected ? "Connected" : "Disconnected"}
          </Text>
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor:
                  driverStatus === "online"
                    ? "#4caf50"
                    : driverStatus === "onRide"
                    ? "#ff9800"
                    : "#f44336",
              },
            ]}
          />
          <Text style={styles.statusText}>{driverStatus.toUpperCase()}</Text>
        </View>
       
        {ride && (rideStatus === "accepted" || rideStatus === "started") && userLocation && (
          <Text style={styles.userLocationText}>
            🟢 User Live: {userLocation.latitude.toFixed(4)},{" "}
            {userLocation.longitude.toFixed(4)}
          </Text>
        )}
       
        {rideStatus === "started" && (
          <Text style={styles.distanceText}>
            📏 Distance Travelled: {travelledKm.toFixed(2)} km
          </Text>
        )}
      </View>
      
      {!ride && (
        <TouchableOpacity
          style={[styles.button, styles.logoutButton]}
          onPress={handleLogout}
          key="logout-button"
        >
          <MaterialIcons name="logout" size={20} color="#fff" />
          <Text style={styles.btnText}>Logout</Text>
        </TouchableOpacity>
      )}
      
      <Modal visible={otpModalVisible} transparent animationType="slide" key="otp-modal">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter OTP</Text>
              <Text style={styles.modalSubtitle}>Please ask passenger for OTP to start the ride</Text>
            </View>
            <TextInput
              placeholder="Enter 4-digit OTP"
              value={enteredOtp}
              onChangeText={setEnteredOtp}
              keyboardType="numeric"
              style={styles.otpInput}
              maxLength={4}
              autoFocus
              placeholderTextColor="#999"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={() => setOtpModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmModalButton]}
                onPress={confirmOTP}
              >
                <Text style={styles.modalButtonText}>Confirm OTP</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      <Modal
        animationType="slide"
        transparent={true}
        visible={showVerificationModal}
        onRequestClose={handleVerificationModalClose}
        key="verification-modal"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Driver Verified Successfully!</Text>
              <TouchableOpacity onPress={handleVerificationModalClose}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
           
            <View style={styles.modalIconContainer}>
              <FontAwesome name="check-circle" size={60} color="#4CAF50" />
            </View>
           
            <Text style={styles.modalMessage}>
              Good news! You have successfully verified your driver.
            </Text>
           
            <View style={styles.billDetailsContainer}>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Pickup location:</Text>
                <Text style={styles.billValue}>{verificationDetails.pickup}</Text>
              </View>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Drop-off location:</Text>
                <Text style={styles.billValue}>{verificationDetails.dropoff}</Text>
              </View>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Time:</Text>
                <Text style={styles.billValue}>{verificationDetails.time}</Text>
              </View>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Speed:</Text>
                <Text style={styles.billValue}>{verificationDetails.speed.toFixed(2)} km/h</Text>
              </View>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Distance:</Text>
                <Text style={styles.billValue}>{verificationDetails.distance.toFixed(2)} km</Text>
              </View>
            </View>
           
            <TouchableOpacity
              style={styles.modalConfirmButton}
              onPress={handleVerificationModalClose}
            >
              <Text style={styles.modalConfirmButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      <Modal
        animationType="slide"
        transparent={true}
        visible={showBillModal}
        onRequestClose={handleBillModalClose}
        key="bill-modal"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🏁 Ride Completed</Text>
              <Text style={styles.modalSubtitle}>Thank you for the safe ride!</Text>
            </View>

            <View style={styles.billCard}>
              <View style={styles.billSection}>
                <Text style={styles.billSectionTitle}>Customer Details</Text>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Name:</Text>
                  <Text style={styles.billValue}>{billDetails.userName}</Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Mobile:</Text>
                  <Text style={styles.billValue}>{billDetails.userMobile}</Text>
                </View>
              </View>

              <View style={styles.billSection}>
                <Text style={styles.billSectionTitle}>Trip Details</Text>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Distance:</Text>
                  <Text style={styles.billValue}>{billDetails.distance}</Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Time:</Text>
                  <Text style={styles.billValue}>{billDetails.travelTime}</Text>
                </View>
              </View>

              <View style={styles.billSection}>
                <Text style={styles.billSectionTitle}>Fare Breakdown</Text>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Distance Charge:</Text>
                  <Text style={styles.billValue}>₹{billDetails.charge}</Text>
                </View>
                <View style={styles.billDivider} />
                <View style={styles.billRow}>
                  <Text style={styles.billTotalLabel}>Total Amount:</Text>
                  <Text style={styles.billTotalValue}>₹{billDetails.charge}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.confirmButton} onPress={handleBillModalClose}>
              <Text style={styles.confirmButtonText}>Confirm & Close Ride</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default DriverScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  locationMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
    marginTop: -4,
  },
  maximizedDetailsContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    maxHeight: "80%",
  },
  maximizedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  brandingContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333333",
  },
  minimizeButton: {
    padding: 8,
  },
  maximizedContent: {
    flex: 1,
  },
  contactSection: {
    marginBottom: 20,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  contactLabel: {
    fontSize: 14,
    color: "#666666",
    marginLeft: 12,
    flex: 1,
  },
  contactValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333333",
  },
  addressSection: {
    marginBottom: 20,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  addressLabel: {
    fontSize: 14,
    color: "#666666",
    marginLeft: 12,
    fontWeight: "500",
  },
  addressText: {
    fontSize: 16,
    color: "#333333",
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  fareSection: {
    marginBottom: 20,
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  fareLabel: {
    fontSize: 16,
    color: "#666666",
    fontWeight: "500",
  },
  fareAmount: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#4CAF50",
  },
  startRideButton: {
    backgroundColor: "#2196F3",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  startRideButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  minimizedBookingBarContainer: {
    position: "absolute",
    bottom: 80,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  minimizedBookingBar: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  minimizedFirstRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  minimizedProfileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  minimizedProfileImageText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  minimizedProfileName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333333",
    flex: 1,
  },
  minimizedExpandButton: {
    padding: 4,
  },
  minimizedSecondRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  minimizedMobileContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  minimizedMobileText: {
    fontSize: 14,
    color: "#333333",
    marginLeft: 6,
    flex: 1,
  },
  minimizedCallButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  rideTakenAlertContainer: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    zIndex: 20,
  },
  rideTakenAlertContent: {
    backgroundColor: "rgba(255, 152, 0, 0.9)",
    padding: 16,
    borderRadius: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  rideTakenAlertText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  alertProgressBar: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  alertProgressFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  onlineToggleContainer: {
    position: "absolute",
    top: 120,
    right: 30,
    left: 'auto',
    zIndex: 10,
  },
  onlineToggleButton: {
    padding: 16,
    borderRadius: 12,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    minWidth: 330,
  },
  onlineButton: {
    backgroundColor: "#4caf50",
  },
  offlineButton: {
    backgroundColor: "#f44336",
  },
  toggleContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  toggleIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  toggleButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  trackingText: {
    color: "#fff",
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
    fontWeight: "500",
  },
  statusContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 40,
    left: 16,
    right: 16,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    padding: 12,
    borderRadius: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    marginRight: 16,
    color: "#333",
  },
  userLocationText: {
    fontSize: 11,
    color: "#4caf50",
    fontWeight: "500",
    marginTop: 2,
  },
  distanceText: {
    fontSize: 11,
    color: "#ff9800",
    fontWeight: "500",
    marginTop: 2,
  },
  rideActions: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  acceptButton: {
    backgroundColor: "#4caf50",
    flex: 1,
  },
  rejectButton: {
    backgroundColor: "#f44336",
    flex: 1,
  },
  startButton: {
    backgroundColor: "#2196f3",
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
  },
  completeButton: {
    backgroundColor: "#ff9800",
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
  },
  logoutButton: {
    backgroundColor: "#dc3545",
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
  },
  btnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 20,
  },
  modalContainer: {
    backgroundColor: "white",
    padding: 24,
    borderRadius: 20,
    width: "100%",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  modalHeader: {
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    color: "#333",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  otpInput: {
    borderWidth: 2,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    marginVertical: 16,
    padding: 20,
    fontSize: 20,
    textAlign: "center",
    fontWeight: "700",
    backgroundColor: "#f8f9fa",
    color: "#333",
  },
  modalButtons: {
    flexDirection: "row",
    marginTop: 8,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cancelModalButton: {
    backgroundColor: "#757575",
  },
  confirmModalButton: {
    backgroundColor: "#4caf50",
  },
  modalButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  billCard: {
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  billSection: {
    marginBottom: 20,
  },
  billSectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  billLabel: {
    fontSize: 14,
    color: "#666666",
    fontWeight: "500",
  },
  billValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333333",
  },
  billDivider: {
    height: 1,
    backgroundColor: "#DDDDDD",
    marginVertical: 12,
  },
  billTotalLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333333",
  },
  billTotalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#4CAF50",
  },
  confirmButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: "#f44336",
    marginBottom: 20,
    textAlign: "center",
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: "#4caf50",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    elevation: 2,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  blackDotMarker: {
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    width: 14,
    height: 14,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  blackDotInner: {
    backgroundColor: "#000000",
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  modalIconContainer: {
    alignItems: "center",
    marginBottom: 15,
  },
  modalMessage: {
    fontSize: 16,
    color: "#333",
    textAlign: "center",
    marginBottom: 20,
  },
  billDetailsContainer: {
    width: "100%",
    backgroundColor: "#F5F5F5",
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  modalConfirmButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  modalConfirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  vehicleTypeBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  vehicleTypeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
});