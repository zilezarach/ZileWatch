import React from "react";
import { TouchableOpacity, View, Text, Modal, StyleSheet } from "react-native";

type ModalPickerProps = {
  visable: boolean;
  onClose: () => void;
  onSelect: (option: "audio" | "video") => void;
};

const ModalPick: React.FC<ModalPickerProps> = ({ visable, onClose, onSelect }) => {
  return (
    <Modal visible={visable} transparent animationType="slide">
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Select Download Option:</Text>
          <TouchableOpacity onPress={() => onSelect("video")} style={styles.optionButton}>
            <Text style={styles.optionText}>Download video</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onSelect("audio")} style={styles.optionButton}>
            <Text style={styles.optionText}>Download Audio</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  modalContent: {
    fontSize: 18,
    padding: 10,
    borderRadius: 10,
    width: "80%"
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 10
  },
  optionButton: {
    padding: 10,
    backgroundColor: "",
    borderRadius: 5,
    marginVertical: 5
  },
  optionText: {
    textAlign: "center",
    color: "#fff"
  },
  closeText: {
    color: "#fff",
    textAlign: "center"
  }
});

export default ModalPick;
