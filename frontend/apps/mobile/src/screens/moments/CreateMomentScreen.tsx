import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { mediaService } from '@/services/media/mediaService';
import { useMomentsStore } from '@/stores/momentsStore';
import type { MobileFile } from '@/services/file/fileService';
import { colors, spacing, typography } from '@/app/theme';

function ComingSoonBadge({ label }: { label: string }) {
  return (
    <View style={styles.badgeRow}>
      <Text style={styles.badgeLabel}>{label}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>即将支持</Text>
      </View>
    </View>
  );
}

export function CreateMomentScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<MobileFile[]>([]);
  const createPost = useMomentsStore((state) => state.createPost);
  const [publishing, setPublishing] = useState(false);

  const handlePickPhoto = () => {
    if (files.length >= 9) {
      Alert.alert('已达上限', '每条动态最多添加 9 张图片。');
      return;
    }
    void mediaService.pickImage().then((file) => {
      if (file) setFiles((prev) => [...prev, file]);
    });
  };

  const handleRemovePhoto = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePublish = () => {
    if (!content.trim() && files.length === 0) {
      Alert.alert('内容为空', '请写点内容或添加图片。');
      return;
    }
    setPublishing(true);
    void createPost(content.trim(), files)
      .then(() => {
        Alert.alert('发布成功', '动态已发布。');
        navigation.goBack();
      })
      .catch(() => {
        Alert.alert('发布失败', '请稍后重试。');
      })
      .finally(() => {
        setPublishing(false);
      });
  };

  return (
    <Screen title="发布动态">
      <View style={styles.container}>
        <TextField label="这一刻的想法" value={content} placeholder="分享新鲜事..." multiline onChangeText={setContent} />

        <View style={styles.section}>
          <PrimaryButton
            label={files.length >= 9 ? '已添加 9 张图片' : '添加图片'}
            onPress={handlePickPhoto}
          />
        </View>

        {files.length > 0 ? (
          <View style={styles.previewGrid}>
            {files.map((file, index) => (
              <View key={index} style={styles.previewItem}>
                <Image source={{ uri: file.uri }} style={styles.previewImage} resizeMode="cover" />
                <Pressable style={styles.previewRemove} onPress={() => handleRemovePhoto(index)}>
                  <Text style={styles.previewRemoveText}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.comingSoonSection}>
          <ComingSoonBadge label="视频上传" />
          <ComingSoonBadge label="可见范围" />
          <ComingSoonBadge label="所在位置" />
        </View>

        <View style={styles.actions}>
          <PrimaryButton label={publishing ? '发布中...' : '发布'} onPress={handlePublish} />
          <Pressable style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>取消</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  section: {
    marginTop: spacing.lg,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  previewItem: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRemoveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  comingSoonSection: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
  },
  badgeLabel: {
    color: colors.muted,
    fontSize: typography.body,
  },
  badge: {
    backgroundColor: colors.warning,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: typography.tiny,
    fontWeight: '600',
  },
  actions: {
    marginTop: spacing.xxl,
    gap: spacing.md,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  cancelText: {
    color: colors.muted,
    fontSize: typography.body,
  },
});
