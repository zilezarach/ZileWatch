import React from "react";
import { Text, View, TextInput, TouchableOpacity, Image } from "react-native";
import styles from "@/components/styles";
import { useRouter } from "expo-router";

export default function Home() {


  const router = useRouter();

  return (



    <View style={styles.container}>

      {/*search bar*/}

      <TextInput placeholder="Search for videos, music, apps and movies..."
        style={styles.searchBar}
      />

      {/*Download button*/}

      <TouchableOpacity style={styles.downloadButton}><Text style={styles.downloadButtonText}>Downloads</Text></TouchableOpacity>





    </View >









  );
}
