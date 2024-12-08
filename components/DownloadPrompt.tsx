import React from "react";
import { TouchableOpacity, View, Text, Modal, StyleSheet } from "react-native";

type ModalPickerProps = {
  visable: boolean;
  onClose: () => void;
  onSelect: (option: "audio" | "video") => void;
};

const ModalPick: React.FC<ModalPickerProps> = ({
  visable,
  onClose,
  onSelect,
}) => {
  return (
    <Modal visible={visable} transparent animationType="slide">
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Select Download Option:</Text>
          <TouchableOpacity
            onPress={() => onSelect("video")}
            style={styles.optionButton}
          >
            <Text style={styles.optionText}>Download video</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onSelect("audio")}
            style={styles.optionButton}
          >
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
    alignItems: "center",
    backgroundColor: "#121212",
  },
  modalContent: {
    fontSize: 18,
    padding: 10,
    borderRadius: 10,
    width: "80%",
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
    backgroundColor: "#FFF",
  },
  optionButton: {
    padding: 10,
    backgroundColor: "#7d0b02",
    borderRadius: 5,
    marginVertical: 5,
  },
  optionText: {
    textAlign: "center",
    color: "#fff",
  },
  closeText: {
    color: "#fff",
    textAlign: "center",
    backgroundColor: "#7d0b02",
    marginTop: 4,
    borderRadius: 10,
    padding: 5,
  },
});

export default ModalPick;
