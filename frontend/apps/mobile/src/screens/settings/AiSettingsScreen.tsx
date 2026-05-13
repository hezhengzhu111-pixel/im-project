import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Switch, Text } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { aiService } from '@/services/ai/aiService';
import type { AiApiKey, AiSettings } from '@/types/models';

export function AiSettingsScreen() {
  const [keys, setKeys] = useState<AiApiKey[]>([]);
  const [settings, setSettings] = useState<AiSettings>({ autoReplyEnabled: false, autoReplyPersona: '' });
  const [provider, setProvider] = useState('openai');
  const [keyName, setKeyName] = useState('');
  const [apiKey, setApiKey] = useState('');

  const load = async () => {
    const [keyResponse, settingsResponse] = await Promise.all([aiService.listKeys(), aiService.getSettings()]);
    setKeys(keyResponse.data);
    setSettings(settingsResponse.data);
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    await aiService.createKey({ provider, keyName, apiKey });
    setApiKey('');
    setKeyName('');
    await load();
  };

  return (
    <Screen title="AI Settings">
      <Text>Auto reply</Text>
      <Switch
        value={settings.autoReplyEnabled}
        onValueChange={(value) => {
          void aiService.updateSettings({ autoReplyEnabled: value }).then((response) => setSettings(response.data));
        }}
      />
      <TextField
        label="Persona"
        value={settings.autoReplyPersona}
        onChangeText={(value) => setSettings({ ...settings, autoReplyPersona: value })}
      />
      <PrimaryButton
        label="Save persona"
        onPress={() => {
          void aiService.updateSettings(settings).then((r) => setSettings(r.data));
        }}
      />
      <TextField label="Provider" value={provider} onChangeText={setProvider} />
      <TextField label="Key name" value={keyName} onChangeText={setKeyName} />
      <TextField label="API key" value={apiKey} secureTextEntry onChangeText={setApiKey} />
      <PrimaryButton
        disabled={!apiKey}
        label="Add API key"
        onPress={() => {
          void create();
        }}
      />
      <FlatList
        data={keys}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              void aiService.testKey(item.id).then((r) => Alert.alert('Key test', r.data.validateStatus));
            }}
            onLongPress={() => {
              void aiService.deleteKey(item.id).then(load);
            }}
          >
            <Text>{item.keyName || item.provider}: {item.maskedKey} {item.validateStatus}</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}
