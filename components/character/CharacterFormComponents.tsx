import React from 'react';
import { View, Text, TextInput, StyleSheet, Dimensions, Platform, TouchableOpacity } from 'react-native';
import { theme } from '@/constants/theme';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
export const headerImageHeight = screenWidth * (16 / 9);
export const settingsPanelHeight = screenHeight * (2 / 3);
export const slideDistance = headerImageHeight + settingsPanelHeight - screenHeight + 40;

export const POSITION_OPTIONS = [
  { label: '角色定义之前', value: 0, isFrameworkPosition: true },
  { label: '角色定义之后', value: 1, isFrameworkPosition: true },
  { label: '作者注释之前', value: 2, isFrameworkPosition: false },
  { label: '作者注释之后', value: 3, isFrameworkPosition: false },
  { label: '按深度插入', value: 4, isFrameworkPosition: false }
];

export const INSERT_TYPE_OPTIONS = [
  { label: '相对位置', value: 'relative' },
  { label: '聊天中', value: 'chat' }
];

export const ROLE_OPTIONS = [
  { label: '用户', value: 'user' },
  { label: 'AI助手', value: 'model' }
];

interface InputFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  multiline?: boolean;
  editable?: boolean;
  onViewDetail?: () => void;
  truncate?: boolean;
  placeholder?: string;
  compact?: boolean;
}

export const InputField: React.FC<InputFieldProps> = ({ 
  label, 
  value, 
  onChangeText, 
  multiline = false,
  editable = true,
  onViewDetail,
  truncate = true,
  placeholder = "",
  compact = false
}) => {
  // For display in the main view, truncate long content
  const displayValue = truncate && value.length > 80 ? value.substring(0, 80) + '...' : value;
  
  return (
    <View style={[
      styles.inputContainer,
      compact && styles.inputContainerCompact
    ]}>
      {!compact && <Text style={styles.inputLabel}>{label}</Text>}
      <TouchableOpacity 
        style={[
          styles.inputWrapper,
          onViewDetail && styles.clickableInput,
          compact && styles.inputWrapperCompact
        ]}
        disabled={!onViewDetail}
        onPress={onViewDetail}
        activeOpacity={onViewDetail ? 0.7 : 1}
      >
        <Text 
          style={[
            styles.inputText, 
            !value && styles.placeholderText,
            !editable && styles.disabledText,
            compact && styles.inputTextCompact
          ]} 
          numberOfLines={multiline ? 3 : 1}
        >
          {compact ? (value || '暂无') : (displayValue || placeholder || `点击添加${label}`)}
        </Text>
        {onViewDetail && !compact && (
          <MaterialIcons name="chevron-right" size={24} color={theme.colors.textSecondary} />
        )}
      </TouchableOpacity>
    </View>
  );
};

interface ToggleButtonProps {
  isDisabled: boolean;
  onToggle: () => void;
}

export const ToggleButton: React.FC<ToggleButtonProps> = ({ isDisabled, onToggle }) => {
  return (
    <TouchableOpacity
      style={[
        styles.toggleButton,
        isDisabled && styles.toggleButtonDisabled
      ]}
      onPress={onToggle}
    >
      <MaterialCommunityIcons 
        name={isDisabled ? "eye-off" : "eye"} 
        size={22} 
        color={theme.colors.white}
      />
    </TouchableOpacity>
  );
};

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    position: 'relative',
    height: headerImageHeight,
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: screenWidth,
    height: headerImageHeight,
    resizeMode: 'cover',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    zIndex: 1,
  },
  uploadImageContainer: {
    width: screenWidth,
    height: headerImageHeight,
    backgroundColor: theme.colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  uploadImageText: {
    color: theme.colors.primary,
    marginTop: 10,
    fontSize: 16,
  },
  changeImageButton: {
    position: 'absolute',
    right: 16,
    top: Platform.OS === 'ios' ? 60 : 40,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 10,
  },
  changeImageButtonText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  avatarContainer: {
    position: 'absolute',
    left: 20,
    bottom: 20,
    zIndex: 10,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: theme.colors.white,
    backgroundColor: theme.colors.cardBackground,
  },
  settingsPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: headerImageHeight,
    height: settingsPanelHeight,
    backgroundColor: 'rgba(30,30,30,0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 1000,
    overflow: 'hidden',
  },
  handle: {
    position: 'relative',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: 'rgba(50,50,50,0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: 40,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  settingsContent: {
    flex: 1,
    padding: theme.spacing.md,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  attributesContainer: {
    flex: 1,
    padding: theme.spacing.md,
  },
  inputContainer: {
    marginBottom: theme.spacing.md,
  },
  input: {
    backgroundColor: 'rgba(60,60,60,0.6)',
    color: theme.colors.text,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.md,
    minHeight: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  inputLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    marginBottom: 6,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    padding: 15,
    margin: 16,
    alignItems: 'center',
    borderRadius: theme.borderRadius.lg,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  saveButtonText: {
    color: theme.colors.black,
    fontSize: 18,
    fontWeight: 'bold',
  },
  sectionHeader: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 10,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },

  entryContainer: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    backgroundColor: 'rgba(50,50,50,0.5)',
  },
  fixedEntryContainer: {
    backgroundColor: 'rgba(60, 60, 60, 0.3)',
    borderStyle: 'dashed',
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderButtons: {
    flexDirection: 'column',
    marginRight: 10,
  },
  orderButton: {
    padding: 4,
  },
  nameInput: {
    flex: 1,
    backgroundColor: 'rgba(60,60,60,0.6)',
    color: theme.colors.text,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  fixedEntryName: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 10,
  },
  disabledInput: {
    backgroundColor: 'rgba(68, 68, 68, 0.5)',
    color: theme.colors.textSecondary,
  },
  entryOptionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    backgroundColor: 'rgba(40,40,40,0.5)',
    borderRadius: theme.borderRadius.sm,
    padding: 8,
    marginTop: 10,
  },
  constantButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  constantButtonActive: {
    backgroundColor: theme.colors.primaryDark,
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  pickerContainer: {
    flex: 1,
    marginHorizontal: 8,
    backgroundColor: '#000000',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  picker: {
    color: theme.colors.white,
    height: 40,
    backgroundColor: '#000000',
  },
  depthInput: {
    width: 60,
    backgroundColor: 'rgba(60,60,60,0.6)',
    color: theme.colors.text,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  depthLabel: {
    color: theme.colors.textSecondary,
    marginRight: 10,
  },
  clickable: {
    cursor: 'pointer',
  },
  inputText: {
    color: theme.colors.text,
    flex: 1,
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
  },
  disabledText: {
    color: theme.colors.textSecondary,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(60,60,60,0.6)',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    minHeight: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  clickableInput: {
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(50,50,50,0.6)',
  },
  viewDetailButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    height: 40,
    justifyContent: 'center',
  },
  viewDetailText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.sm,
  },
  disabledEntry: {
    opacity: 0.5,
  },
  toggleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  toggleButtonDisabled: {
    backgroundColor: theme.colors.danger,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(60,60,60,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
  },
  inputContainerCompact: {
    marginBottom: 0,
    flex: 1,
  },
  inputWrapperCompact: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    minHeight: 36,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  inputTextCompact: {
    fontSize: theme.fontSizes.md,
  },
  worldBookEntryContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    marginBottom: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  worldBookHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  worldBookTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  worldBookActions: {
    flexDirection: 'row',
  },
  actionIcon: {
    padding: 5,
  },
  worldBookContent: {
    color: '#ddd',
    fontSize: 14,
  },
  addButton: {
    backgroundColor: 'rgba(255, 224, 195, 0.2)',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: 10,
  },
  addButtonText: {
    color: 'rgb(255, 224, 195)',
    marginLeft: 5,
    fontSize: 16,
  },
  pickersContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  pickerWrapper: {
    backgroundColor: '#444',
    borderRadius: 8,
    flex: 1,
    marginRight: 10,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  pickerText: {
    color: '#fff',
  },
  depthContainer: {
    backgroundColor: '#444',
    borderRadius: 8,
    width: 80,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionContainer: {
    marginTop: 20,
    marginBottom: 15,
  },
  presetItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  presetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  presetActions: {
    flexDirection: 'row',
  },
  presetContent: {
    color: '#ddd',
    fontSize: 14,
    marginTop: 5,
  },
  presetActionButton: {
    padding: 5,
  },
  disabledPreset: {
    opacity: 0.5,
  },
  authorNoteContainer: {
    backgroundColor: 'rgba(255, 224, 195, 0.1)',
    borderRadius: 8,
    padding: 15,
    marginTop: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 224, 195, 0.3)',
  },
  authorNoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  authorNoteTitle: {
    color: 'rgb(255, 224, 195)',
    fontSize: 16,
    fontWeight: 'bold',
  },
  authorNoteEditButton: {
    padding: 5,
  },
  noteTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteInjectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  noteInjectionLabel: {
    color: '#ddd',
    marginRight: 10,
  },
  noteInjectionInput: {
    backgroundColor: '#444',
    width: 50,
    height: 35,
    borderRadius: 5,
    textAlign: 'center',
    color: '#fff',
  },
  noteContentPreview: {
    color: '#ddd',
    marginTop: 10,
  },
  // Drag and drop related styles
  dragIndicator: {
    padding: 5,
  },
});
