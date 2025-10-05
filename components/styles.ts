import { StyleSheet } from "react-native";
import { Appearance } from "react-native";

const isDarkMode = Appearance.getColorScheme() === "dark";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: isDarkMode ? "#121212" : "#FFFFFF",
  },
  searchBar: {
    height: 40,
    borderColor: isDarkMode ? "#555" : "#ccc",
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 20,
    backgroundColor: isDarkMode ? "#333" : "#fff",
    color: isDarkMode ? "#fff" : "#000",
  },
  downloadButton: {
    backgroundColor: "#7d0b02",
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginBottom: 20,
  },
  downloadButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  navbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  navItem: {
    padding: 10,
  },
  navText: {
    fontSize: 16,
    color: isDarkMode ? "#fff" : "#000",
  },
  socialMediaContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  socialIcon: {
    padding: 10,
  },
  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: isDarkMode ? "#555" : "#ccc",
  },
  bottomNavItem: {
    padding: 10,
  },
  bottomNavText: {
    fontSize: 16,
    color: isDarkMode ? "#fff" : "#000",
  },
});

export default styles;
