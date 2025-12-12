import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
  Animated,
  StatusBar,
  Linking,
} from 'react-native';
import { getApp } from '@react-native-firebase/app';
import { getAuth, signInWithPhoneNumber, PhoneAuthProvider, signInWithCredential } from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/FontAwesome';
import { RootStackParamList } from '../App';

const { width, height } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Initialize Firebase with modular API
const auth = getAuth(getApp());

const getApiUrl = () => {
  return 'https://ba-lhhs.onrender.com/api/auth';
};

const API_URL = getApiUrl();

const LoginScreen = () => {
  const [mobileNumber, setMobileNumber] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendAvailable, setResendAvailable] = useState(true);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const navigation = useNavigation<NavigationProp>();
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    const restoreVerification = async () => {
      try {
        const storedVerificationId = await AsyncStorage.getItem('verificationId');
        const storedPhone = await AsyncStorage.getItem('phoneNumber');

        if (storedVerificationId && storedPhone) {
          setVerificationId(storedVerificationId);
          setMobileNumber(storedPhone);
          setOtpSent(true);
          Alert.alert('Session Restored', `Please enter OTP sent to ${storedPhone}`);
        }
      } catch (error) {
        console.log('Restore session error:', error);
      }
    };

    restoreVerification();
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCountdown > 0) {
      setResendAvailable(false);
      timer = setInterval(() => {
        setResendCountdown((prev) => {
          if (prev <= 1) {
            setResendAvailable(true);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCountdown]);

  const isValidPhoneNumber = useCallback((phone: string) => /^[6-9]\d{9}$/.test(phone), []);

  const sendOTP = useCallback(async (phone: string) => {
    if (!phone) {
      Alert.alert('Error', 'Please enter your mobile number.');
      return;
    }
    
    if (!isValidPhoneNumber(phone)) {
      Alert.alert('Error', 'Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    
    try {
      setLoading(true);
      console.log(`📞 Checking driver: ${phone}`);
      console.log(`🌐 API URL: ${API_URL}`);
      
      // STEP 1A: Check if driver exists in MongoDB
      try {
        const checkResponse = await axios.post(
          `${API_URL}/request-driver-otp`, 
          { phoneNumber: phone },
          { 
            timeout: 15000,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          }
        );
        
        console.log('📋 Driver check response:', checkResponse.data);
        
        if (checkResponse.data.success) {
          console.log(`✅ Driver found: ${checkResponse.data.driverId}`);
          console.log(`🚗 Vehicle Type: ${checkResponse.data.vehicleType}`);
          console.log(`🚙 Vehicle Number: ${checkResponse.data.vehicleNumber}`);
          console.log(`💰 Wallet: ₹${checkResponse.data.wallet}`);
        } else {
          Alert.alert(
            'Authentication Failed',
            'This mobile number is not registered in our system. Please contact our admin at eazygo2026@gmail.com',
            [
              { 
                text: 'Contact Admin', 
                onPress: () => Linking.openURL('mailto:eazygo2026@gmail.com?subject=Driver Registration Issue')
              },
              { text: 'OK', style: 'cancel' }
            ]
          );
          return;
        }
      } catch (error: any) {
        console.log('⚠️ Backend check error:', error.message);
        
        if (error.response?.status === 404) {
          Alert.alert(
            'Authentication Failed',
            'This mobile number is not registered in our system. Please contact our admin at eazygo2026@gmail.com',
            [
              { 
                text: 'Contact Admin', 
                onPress: () => Linking.openURL('mailto:eazygo2026@gmail.com?subject=Driver Registration Issue')
              },
              { text: 'OK', style: 'cancel' }
            ]
          );
          return;
        }
        
        Alert.alert(
          'Server Error',
          'Cannot connect to server. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      // STEP 1B: Send Firebase OTP using modular API
      try {
        console.log(`🔥 Sending Firebase OTP to: +91${phone}`);
        
        const formattedPhone = `+91${phone}`;
        
        // Send OTP using modular Firebase API
        const confirmation = await signInWithPhoneNumber(auth, formattedPhone);
        
        setVerificationId(confirmation.verificationId);
        await AsyncStorage.setItem('verificationId', confirmation.verificationId);
        await AsyncStorage.setItem('phoneNumber', phone);
        
        Alert.alert(
          'OTP Sent',
          `OTP has been sent to ${phone}. Please check your messages.`,
          [{ text: 'OK' }]
        );
        
        setOtpSent(true);
        setResendCountdown(30);
        
      } catch (firebaseError: any) {
        console.error('❌ Firebase OTP error:', firebaseError);
        
        if (firebaseError.code === 'auth/invalid-phone-number') {
          Alert.alert('Invalid Phone', 'Please enter a valid phone number.');
        } else if (firebaseError.code === 'auth/too-many-requests') {
          Alert.alert('Too Many Attempts', 'Please try again later.');
        } else if (firebaseError.code === 'auth/quota-exceeded') {
          Alert.alert('Quota Exceeded', 'SMS quota exceeded. Please try again later.');
        } else {
          Alert.alert('Error', firebaseError.message || 'Failed to send OTP. Please try again.');
        }
      }
      
    } catch (error: any) {
      console.error('❌ General error in sendOTP:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [isValidPhoneNumber]);

  const verifyOTP = useCallback(async () => {
    console.log('🔍 verifyOTP called with:', { 
      code, 
      verificationId: verificationId ? 'exists' : 'null',
      mobileNumber 
    });
    
    if (!code) {
      Alert.alert('Error', 'Please enter OTP.');
      return;
    }

    if (!verificationId) {
      Alert.alert('Error', 'No OTP session found. Please request a new OTP.');
      return;
    }

    try {
      setLoading(true);
      console.log(`🔐 Verifying OTP: ${code}`);

      // STEP 2A: Verify with Firebase ONLY using modular API
      const credential = PhoneAuthProvider.credential(verificationId, code);
      const userCredential = await signInWithCredential(auth, credential);
      
      console.log('✅ Firebase verification successful:', userCredential.user.uid);

      // STEP 2B: Get COMPLETE driver info from live server
      console.log(`📞 Getting COMPLETE driver info for: ${mobileNumber}`);
      console.log(`🌐 API URL: ${API_URL}`);
      
      try {
        const response = await axios.post(
          `${API_URL}/get-complete-driver-info`,
          { phoneNumber: mobileNumber },
          { 
            timeout: 15000,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        console.log('📋 Complete driver info response:', response.data);

        if (response.data.success) {
          const driverData = response.data.driver;
          
          // 🖨️ PRINT COMPLETE DRIVER DATA TO CONSOLE
          console.log("📋 ===== COMPLETE DRIVER DATA FROM SERVER =====");
          console.log("Driver ID:", driverData.driverId);
          console.log("Name:", driverData.name);
          console.log("Phone:", driverData.phone);
          console.log("Email:", driverData.email || "Not provided");
          console.log("Vehicle Type:", driverData.vehicleType);
          console.log("Vehicle Number:", driverData.vehicleNumber);
          console.log("Wallet Balance: ₹", driverData.wallet || 0);
          console.log("Status:", driverData.status);
          console.log("License Number:", driverData.licenseNumber || "Not provided");
          console.log("Aadhar Number:", driverData.aadharNumber || "Not provided");
          console.log("Location:", JSON.stringify(driverData.location) || "Not set");
          console.log("FCM Token:", driverData.fcmToken ? "Yes" : "No");
          console.log("Platform:", driverData.platform || "android");
          console.log("Total Rides:", driverData.totalRides || 0);
          console.log("Rating:", driverData.rating || 0);
          console.log("Earnings: ₹", driverData.earnings || 0);
          console.log("Created At:", driverData.createdAt || "Not available");
          console.log("Last Update:", driverData.lastUpdate || "Not available");
          console.log("===========================================");

          // Store ALL driver data in AsyncStorage
          await AsyncStorage.multiSet([
            ["authToken", response.data.token || `firebase-${Date.now()}`],
            ["driverId", driverData.driverId],
            ["driverName", driverData.name],
            ["driverPhone", driverData.phone],
            ["driverVehicleType", driverData.vehicleType],
            ["driverVehicleNumber", driverData.vehicleNumber || ""],
            ["driverWallet", (driverData.wallet || 0).toString()],
            ["driverEmail", driverData.email || ""],
            ["driverLicense", driverData.licenseNumber || ""],
            ["driverAadhar", driverData.aadharNumber || ""],
            ["driverStatus", driverData.status || "Offline"],
            ["driverRating", (driverData.rating || 0).toString()],
            ["driverEarnings", (driverData.earnings || 0).toString()],
            ["driverInfo", JSON.stringify(driverData)]
          ]);

          // Clean up verification data
          await AsyncStorage.removeItem('verificationId');
          await AsyncStorage.removeItem('phoneNumber');

          // Navigate to Screen1 with complete driverInfo
          navigation.reset({
            index: 0,
            routes: [
              {
                name: 'Screen1',
                params: {
                  driverId: driverData.driverId,
                  driverName: driverData.name,
                  vehicleType: driverData.vehicleType,
                  driverPhone: driverData.phone,
                  driverVehicleNumber: driverData.vehicleNumber,
                  driverWallet: driverData.wallet,
                },
              },
            ],
          });
        } else {
          throw new Error(response.data.message || 'Driver data not found');
        }
        
      } catch (backendError: any) {
        console.error('❌ Backend error after Firebase auth:', backendError);
        
        // Create minimal driver data for offline mode
        const minimalDriver = {
          driverId: 'temp-' + mobileNumber,
          name: 'Driver',
          phone: mobileNumber,
          vehicleType: 'Unknown',
          vehicleNumber: 'N/A',
          status: 'Live',
          wallet: 0,
          isOffline: true
        };
        
        await AsyncStorage.multiSet([
          ['authToken', 'firebase-temp-token-' + Date.now()],
          ['driverId', minimalDriver.driverId],
          ['driverName', minimalDriver.name],
          ['driverVehicleType', minimalDriver.vehicleType],
          ['driverPhone', mobileNumber],
          ['driverInfo', JSON.stringify(minimalDriver)]
        ]);

        await AsyncStorage.removeItem('verificationId');

        Alert.alert(
          'Offline Mode',
          'Connected with Firebase but server is unavailable. Some features may be limited.',
          [
            {
              text: 'Continue',
              onPress: () => {
                navigation.reset({
                  index: 0,
                  routes: [
                    {
                      name: 'Screen1',
                      params: { 
                        driverId: minimalDriver.driverId,
                        driverName: minimalDriver.name,
                        vehicleType: minimalDriver.vehicleType,
                        isOffline: true 
                      },
                    },
                  ],
                });
              }
            }
          ]
        );
      }
      
    } catch (error: any) {
      console.error('❌ OTP verification error:', error);
      
      if (error.code === 'auth/invalid-verification-code') {
        Alert.alert('Invalid OTP', 'The OTP you entered is incorrect. Please try again.');
      } else if (error.code === 'auth/code-expired') {
        Alert.alert('OTP Expired', 'The OTP has expired. Please request a new one.');
      } else if (error.code === 'auth/too-many-requests') {
        Alert.alert('Too Many Attempts', 'Please try again later.');
      } else {
        Alert.alert('Verification Failed', error.message || 'Failed to verify OTP.');
      }
      
      // Clear OTP field on error
      setCode('');
    } finally {
      setLoading(false);
    }
  }, [code, mobileNumber, navigation, verificationId]);




  // In login response handling
const handleLoginResponse = async (response) => {
  if (response.data.success) {
    // ✅ STORE ALL DRIVER DATA INCLUDING VEHICLE TYPE
    await AsyncStorage.multiSet([
      ["driverId", response.data.driver.driverId],
      ["driverName", response.data.driver.name],
      ["driverVehicleType", response.data.driver.vehicleType], // ✅ CRITICAL
      ["driverVehicleNumber", response.data.driver.vehicleNumber],
      ["driverPhone", response.data.driver.phone],
      ["authToken", response.data.token],
    ]);
    
    console.log(`✅ Driver logged in: ${response.data.driver.driverId}`);
    console.log(`🚗 Vehicle type: ${response.data.driver.vehicleType}`);
    console.log(`🚙 Vehicle number: ${response.data.driver.vehicleNumber}`);
    
    // Navigate to driver screen
    navigation.navigate("DriverScreen", {
      driverId: response.data.driver.driverId,
      driverName: response.data.driver.name,
      vehicleType: response.data.driver.vehicleType, // ✅ PASS TO SCREEN
      vehicleNumber: response.data.driver.vehicleNumber
    });
  }
};
  return (
    <LinearGradient
      colors={['#4facfe', '#00f2fe']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        <Animated.View 
          style={[
            styles.contentContainer, 
            { 
              opacity: fadeAnim, 
              transform: [{ translateY: slideAnim }] 
            } 
          ]}
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Icon name="taxi" size={80} color="#fff" />
              <Text style={styles.appName}>EazyGo Driver</Text>
            </View>
          </View>
          
          <View style={styles.card}>
            <Text style={styles.title}>Welcome Back!</Text>
            <Text style={styles.subtitle}>Login to your driver account</Text>
            
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Icon name="phone" size={20} color="#4facfe" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Mobile Number"
                  placeholderTextColor="#999"
                  value={mobileNumber}
                  onChangeText={(text) => setMobileNumber(text.replace(/[^0-9]/g, ''))}
                  keyboardType="phone-pad"
                  maxLength={10}
                  editable={!loading}
                />
              </View>
              
              {otpSent && (
                <View style={styles.inputWrapper}>
                  <Icon name="lock" size={20} color="#4facfe" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter OTP"
                    placeholderTextColor="#999"
                    value={code}
                    onChangeText={(text) => setCode(text.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                  />
                </View>
              )}
            </View>
            
            <View style={styles.buttonContainer}>
              {otpSent ? (
                <>
                  <TouchableOpacity 
                    style={[styles.button, loading && styles.buttonDisabled]} 
                    onPress={verifyOTP} 
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.buttonText}>Verify OTP</Text>
                    )}
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.resendButton}
                    onPress={() => sendOTP(mobileNumber)}
                    disabled={loading || !resendAvailable}
                  >
                    <Text style={[
                      styles.resendText, 
                      !resendAvailable && styles.resendDisabledText
                    ]}>
                      {resendAvailable ? 'Resend OTP' : `Resend in ${resendCountdown}s`}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity 
                  style={[styles.button, loading && styles.buttonDisabled]} 
                  onPress={() => sendOTP(mobileNumber)} 
                  disabled={loading}
                >
                  {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.buttonText}>Send OTP</Text>
                    )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    width: width * 0.9,
    maxWidth: 400,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 10,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 30,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 15,
    marginBottom: 15,
    paddingHorizontal: 15,
    height: 55,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  buttonContainer: {
    marginTop: 10,
  },
  button: {
    backgroundColor: '#4facfe',
    borderRadius: 15,
    height: 55,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#a0a0a0',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resendButton: {
    alignItems: 'center',
    marginTop: 10,
  },
  resendText: {
    color: '#4facfe',
    fontSize: 16,
  },
  resendDisabledText: {
    color: '#a0a0a0',
  },
});

export default LoginScreen;