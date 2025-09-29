import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

interface ColorPickerProps {
  color: string;
  onColorChange: (color: string) => void;
  style?: any;
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

const PRESET_COLORS = [
  '#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3',
  '#FF1493', '#00CED1', '#32CD32', '#FFD700', '#FF69B4', '#87CEEB', '#DDA0DD',
  '#FFFFFF', '#C0C0C0', '#808080', '#404040', '#000000', '#8B4513', '#A0522D',
  '#2F4F4F', '#556B2F', '#8B008B', '#483D8B', '#2E8B57', '#B22222', '#D2691E',
];

const ColorPicker: React.FC<ColorPickerProps> = ({ color, onColorChange, style }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [mode, setMode] = useState<'HSL' | 'RGB'>('HSL');
  const [hsl, setHsl] = useState<HSL>({ h: 0, s: 50, l: 50 });
  const [rgb, setRgb] = useState<RGB>({ r: 255, g: 255, b: 255 });
  const [hexInput, setHexInput] = useState('#FFFFFF');

  useEffect(() => {
    const rgbFromHex = hexToRgb(color);
    if (rgbFromHex) {
      setRgb(rgbFromHex);
      setHsl(rgbToHsl(rgbFromHex));
      setHexInput(color.toUpperCase());
    }
  }, [color]);

  const hexToRgb = (hex: string): RGB | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  const rgbToHex = (rgb: RGB): string => {
    return "#" + [rgb.r, rgb.g, rgb.b].map(x => {
      const hex = Math.round(x).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    }).join("");
  };

  const rgbToHsl = (rgb: RGB): HSL => {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
  };

  const hslToRgb = (hsl: HSL): RGB => {
    const h = hsl.h / 360;
    const s = hsl.s / 100;
    const l = hsl.l / 100;

    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return { r: r * 255, g: g * 255, b: b * 255 };
  };

  const updateColor = (newRgb: RGB) => {
    setRgb(newRgb);
    setHsl(rgbToHsl(newRgb));
    const hex = rgbToHex(newRgb);
    setHexInput(hex);
    onColorChange(hex);
  };

  const updateFromHsl = (newHsl: HSL) => {
    setHsl(newHsl);
    const newRgb = hslToRgb(newHsl);
    setRgb(newRgb);
    const hex = rgbToHex(newRgb);
    setHexInput(hex);
    onColorChange(hex);
  };

  const updateFromHex = (hex: string) => {
    const rgbFromHex = hexToRgb(hex);
    if (rgbFromHex) {
      updateColor(rgbFromHex);
    }
  };

  const currentColor = rgbToHex(rgb);

  return (
    <>
      <TouchableOpacity
        style={[styles.colorButton, style, { backgroundColor: currentColor }]}
        onPress={() => setIsVisible(true)}
      >
        <View style={styles.colorButtonInner}>
          <Ionicons name="color-palette" size={20} color="#fff" />
        </View>
      </TouchableOpacity>

      <Modal
        visible={isVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>颜色选择器</Text>
              <TouchableOpacity onPress={() => setIsVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Current Color Preview */}
              <View style={styles.colorPreview}>
                <View style={[styles.currentColor, { backgroundColor: currentColor }]} />
                <Text style={styles.colorHex}>{currentColor}</Text>
              </View>

              {/* Mode Toggle */}
              <View style={styles.modeToggle}>
                <TouchableOpacity
                  style={[styles.modeButton, mode === 'HSL' && styles.activeModeButton]}
                  onPress={() => setMode('HSL')}
                >
                  <Text style={[styles.modeButtonText, mode === 'HSL' && styles.activeModeButtonText]}>HSL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeButton, mode === 'RGB' && styles.activeModeButton]}
                  onPress={() => setMode('RGB')}
                >
                  <Text style={[styles.modeButtonText, mode === 'RGB' && styles.activeModeButtonText]}>RGB</Text>
                </TouchableOpacity>
              </View>

              {/* Color Controls */}
              {mode === 'HSL' ? (
                <View style={styles.controlsSection}>
                  <View style={styles.sliderGroup}>
                    <Text style={styles.sliderLabel}>色相 (H): {Math.round(hsl.h)}°</Text>
                    <Slider
                      style={styles.slider}
                      value={hsl.h}
                      minimumValue={0}
                      maximumValue={360}
                      onValueChange={(value) => updateFromHsl({ ...hsl, h: value })}
                      minimumTrackTintColor="#ff6b6b"
                      maximumTrackTintColor="#444"
                      thumbTintColor="#ff6b6b"
                    />
                  </View>
                  <View style={styles.sliderGroup}>
                    <Text style={styles.sliderLabel}>饱和度 (S): {Math.round(hsl.s)}%</Text>
                    <Slider
                      style={styles.slider}
                      value={hsl.s}
                      minimumValue={0}
                      maximumValue={100}
                      onValueChange={(value) => updateFromHsl({ ...hsl, s: value })}
                      minimumTrackTintColor="#4ecdc4"
                      maximumTrackTintColor="#444"
                      thumbTintColor="#4ecdc4"
                    />
                  </View>
                  <View style={styles.sliderGroup}>
                    <Text style={styles.sliderLabel}>亮度 (L): {Math.round(hsl.l)}%</Text>
                    <Slider
                      style={styles.slider}
                      value={hsl.l}
                      minimumValue={0}
                      maximumValue={100}
                      onValueChange={(value) => updateFromHsl({ ...hsl, l: value })}
                      minimumTrackTintColor="#45b7d1"
                      maximumTrackTintColor="#444"
                      thumbTintColor="#45b7d1"
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.controlsSection}>
                  <View style={styles.sliderGroup}>
                    <Text style={styles.sliderLabel}>红色 (R): {Math.round(rgb.r)}</Text>
                    <Slider
                      style={styles.slider}
                      value={rgb.r}
                      minimumValue={0}
                      maximumValue={255}
                      onValueChange={(value) => updateColor({ ...rgb, r: value })}
                      minimumTrackTintColor="#ff4757"
                      maximumTrackTintColor="#444"
                      thumbTintColor="#ff4757"
                    />
                  </View>
                  <View style={styles.sliderGroup}>
                    <Text style={styles.sliderLabel}>绿色 (G): {Math.round(rgb.g)}</Text>
                    <Slider
                      style={styles.slider}
                      value={rgb.g}
                      minimumValue={0}
                      maximumValue={255}
                      onValueChange={(value) => updateColor({ ...rgb, g: value })}
                      minimumTrackTintColor="#2ed573"
                      maximumTrackTintColor="#444"
                      thumbTintColor="#2ed573"
                    />
                  </View>
                  <View style={styles.sliderGroup}>
                    <Text style={styles.sliderLabel}>蓝色 (B): {Math.round(rgb.b)}</Text>
                    <Slider
                      style={styles.slider}
                      value={rgb.b}
                      minimumValue={0}
                      maximumValue={255}
                      onValueChange={(value) => updateColor({ ...rgb, b: value })}
                      minimumTrackTintColor="#3742fa"
                      maximumTrackTintColor="#444"
                      thumbTintColor="#3742fa"
                    />
                  </View>
                </View>
              )}

              {/* Hex Input */}
              <View style={styles.hexInputSection}>
                <Text style={styles.hexLabel}>十六进制颜色:</Text>
                <TextInput
                  style={styles.hexInput}
                  value={hexInput}
                  onChangeText={setHexInput}
                  onEndEditing={() => updateFromHex(hexInput)}
                  placeholder="#FFFFFF"
                  placeholderTextColor="#888"
                />
              </View>

              {/* Preset Colors */}
              <View style={styles.presetsSection}>
                <Text style={styles.presetsTitle}>预设颜色</Text>
                <View style={styles.presetsGrid}>
                  {PRESET_COLORS.map((presetColor, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[styles.presetColor, { backgroundColor: presetColor }]}
                      onPress={() => updateFromHex(presetColor)}
                    />
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={() => setIsVisible(false)}
              >
                <Text style={styles.confirmButtonText}>确认</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorButtonInner: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 4,
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalBody: {
    padding: 16,
  },
  colorPreview: {
    alignItems: 'center',
    marginBottom: 20,
  },
  currentColor: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#555',
    marginBottom: 8,
  },
  colorHex: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modeToggle: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: '#333',
    borderRadius: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeModeButton: {
    backgroundColor: '#ff6b6b',
  },
  modeButtonText: {
    color: '#aaa',
    fontWeight: 'bold',
  },
  activeModeButtonText: {
    color: '#fff',
  },
  controlsSection: {
    marginBottom: 20,
  },
  sliderGroup: {
    marginBottom: 16,
  },
  sliderLabel: {
    color: '#ddd',
    fontSize: 14,
    marginBottom: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  hexInputSection: {
    marginBottom: 20,
  },
  hexLabel: {
    color: '#ddd',
    fontSize: 14,
    marginBottom: 8,
  },
  hexInput: {
    backgroundColor: '#333',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#555',
  },
  presetsSection: {
    marginBottom: 20,
  },
  presetsTitle: {
    color: '#ddd',
    fontSize: 14,
    marginBottom: 12,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetColor: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#555',
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  confirmButton: {
    backgroundColor: '#ff6b6b',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ColorPicker;
