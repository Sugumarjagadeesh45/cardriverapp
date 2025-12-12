// // App.tsx - Complete updated file
// import React, { useEffect, useState } from "react";
// import { NavigationContainer } from "@react-navigation/native";
// import { createNativeStackNavigator } from "@react-navigation/native-stack";
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import Geolocation from '@react-native-community/geolocation';
// import LoginScreen from "./src/LoginScreen";
// import Screen1 from "./src/Screen1";
// import ActiveRideScreen from "./src/ActiveRideScreen";
// import RejectRideScreen from "./src/RejectRideScreen";
// import 'react-native-get-random-values';
// import { v4 as uuidv4 } from 'uuid';
// import api from "./utils/api";

// export type RootStackParamList = {
//   LoginScreen: undefined;
//   Screen1: { driverInfo: any };
//   ActiveRideScreen: { rideId: string };
//   RejectRideScreen: { rideId: string };
// };

// const id: string = uuidv4();
// console.log("App UUID:", id);

// const Stack = createNativeStackNavigator<RootStackParamList>();

// export default function App() {
//   const [initialRoute, setInitialRoute] = useState<string | null>(null);

//   // Check for stored token on app launch
//   useEffect(() => {
//     const checkAuth = async () => {
//       try {
//         console.log("🔍 Checking for stored auth token...");
        
//         // Get all possible stored items
//         const [token, driverInfoJson, phoneNumber] = await AsyncStorage.multiGet([
//           "authToken",
//           "driverInfo",
//           "phoneNumber"
//         ]);
        
//         const tokenValue = token[1];
//         const driverInfoValue = driverInfoJson[1];
//         const phoneValue = phoneNumber[1];
        
//         console.log("📋 Storage check results:", {
//           hasToken: !!tokenValue,
//           hasDriverInfo: !!driverInfoValue,
//           hasPhone: !!phoneValue,
//           tokenLength: tokenValue?.length,
//           driverInfo: driverInfoValue ? 'exists' : 'null'
//         });

//         if (tokenValue && driverInfoValue) {
//           try {
//             const driverInfo = JSON.parse(driverInfoValue);
//             console.log("✅ Valid credentials found:", {
//               driverId: driverInfo.driverId,
//               name: driverInfo.name,
//               phone: driverInfo.phone
//             });
            
//             // Navigate to Screen1 directly with driverInfo
//             setInitialRoute("Screen1");
            
//           } catch (parseError) {
//             console.error("❌ Error parsing driver info:", parseError);
//             await AsyncStorage.clear();
//             setInitialRoute("LoginScreen");
//           }
//         } else {
//           console.log("❌ Incomplete credentials, showing LoginScreen");
//           await AsyncStorage.clear();
//           setInitialRoute("LoginScreen");
//         }
//       } catch (err: any) {
//         console.error("❌ Error checking auth:", err);
//         await AsyncStorage.clear();
//         setInitialRoute("LoginScreen");
//       }
//     };

//     checkAuth();
//   }, []);

//   if (!initialRoute) {
//     return null; // Render nothing until auth check is complete
//   }

//   return (
//     <NavigationContainer>
//       <Stack.Navigator initialRouteName={initialRoute}>
//         <Stack.Screen
//           name="LoginScreen"
//           component={LoginScreen}
//           options={{ headerShown: false }}
//         />
//         <Stack.Screen
//           name="Screen1"
//           component={Screen1}
//           options={{ headerShown: false }}
//         />
//         <Stack.Screen
//           name="ActiveRideScreen"
//           component={ActiveRideScreen}
//           options={{ title: "Active Ride" }}
//         />
//         <Stack.Screen
//           name="RejectRideScreen"
//           component={RejectRideScreen}
//           options={{ title: "Reject Ride" }}
//         />
//       </Stack.Navigator>
//     </NavigationContainer>
//   );
// }

import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Geolocation from '@react-native-community/geolocation';
import LoginScreen from "./src/LoginScreen";
import Screen1 from "./src/Screen1";
import ActiveRideScreen from "./src/ActiveRideScreen";
import RejectRideScreen from "./src/RejectRideScreen";
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export type RootStackParamList = {
  LoginScreen: undefined;
  Screen1: { driverInfo?: any }; // Updated to accept driverInfo
  ActiveRideScreen: { rideId: string };
  RejectRideScreen: { rideId: string };
};

const id: string = uuidv4();
console.log("App UUID:", id);

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<string | null>(null);

  // Check for stored token on app launch
  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log("🔍 Checking for stored auth token...");
        
        // Get all stored items
        const [token, driverInfoJson] = await AsyncStorage.multiGet([
          "authToken",
          "driverInfo"
        ]);
        
        const tokenValue = token[1];
        const driverInfoValue = driverInfoJson[1];
        
        console.log("📋 Storage check results:", {
          hasToken: !!tokenValue,
          hasDriverInfo: !!driverInfoValue,
          tokenLength: tokenValue?.length,
          driverInfo: driverInfoValue ? 'exists' : 'null'
        });

        if (tokenValue && driverInfoValue) {
          try {
            const driverInfo = JSON.parse(driverInfoValue);
            console.log("✅ Valid credentials found:", {
              driverId: driverInfo.driverId,
              name: driverInfo.name,
              phone: driverInfo.phone
            });
            
            // Navigate to Screen1 directly
            setInitialRoute("Screen1");
            
          } catch (parseError) {
            console.error("❌ Error parsing driver info:", parseError);
            await AsyncStorage.clear();
            setInitialRoute("LoginScreen");
          }
        } else {
          console.log("❌ Incomplete credentials, showing LoginScreen");
          await AsyncStorage.clear();
          setInitialRoute("LoginScreen");
        }
      } catch (err: any) {
        console.error("❌ Error checking auth:", err);
        await AsyncStorage.clear();
        setInitialRoute("LoginScreen");
      }
    };

    checkAuth();
  }, []);

  if (!initialRoute) {
    return null; // Render nothing until auth check is complete
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRoute}>
        <Stack.Screen
          name="LoginScreen"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Screen1"
          component={Screen1}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ActiveRideScreen"
          component={ActiveRideScreen}
          options={{ title: "Active Ride" }}
        />
        <Stack.Screen
          name="RejectRideScreen"
          component={RejectRideScreen}
          options={{ title: "Reject Ride" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}