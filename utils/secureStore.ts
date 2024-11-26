import * as SecureStore from "expo-secure-store";

export const saveApiKey = async (key: string, value: string) => {
  try {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED
    });
    console.log("API key saved successfully!");
  } catch (error) {
    console.error("Error saving API key:", error);
  }
};

export const getApiKey = async (key: string) => {
  try {
    const apiKey = await SecureStore.getItemAsync(key);
    if (apiKey) {
      console.log("API key retrieved:", apiKey);
      return apiKey;
    } else {
      console.log("No API key found!");
      return null;
    }
  } catch (error) {
    console.error("Error retrieving API key:", error);
  }
};

export const deleteApiKey = async (key: string) => {
  try {
    await SecureStore.deleteItemAsync(key);
    console.log("API key deleted successfully!");
  } catch (error) {
    console.error("Error deleting API key:", error);
  }
};
