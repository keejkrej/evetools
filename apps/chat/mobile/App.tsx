import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useEffect, useRef, useState } from "react";

type Attachment = {
  id: string;
  name: string;
  mediaType: string;
  data: string;
};
type ToolActivity = {
  id: string;
  name: string;
  title?: string;
  status: "running" | "complete" | "error";
};
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  reasoning?: string;
  activities?: ToolActivity[];
};
type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

const STORAGE_KEY = "eve-mobile-conversations-v1";
const PROVIDER_KEY = "eve-mobile-provider-v1";
type Provider = "cursor" | "ollama";
const modelKey = (provider: Provider) => `eve-mobile-model-${provider}-v1`;
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
type ModelOption = { id: string; displayName: string; description?: string };
const CURSOR_FALLBACK_MODELS: ModelOption[] = [
  { id: "auto", displayName: "Auto" },
  { id: "composer-2.5", displayName: "Composer 2.5" },
];
const OLLAMA_FALLBACK_MODELS: ModelOption[] = [
  { id: "gpt-oss:120b", displayName: "gpt-oss:120b" },
];
const fallbackModels = (provider: Provider) =>
  provider === "ollama" ? OLLAMA_FALLBACK_MODELS : CURSOR_FALLBACK_MODELS;
type ChatStreamEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | ({ type: "tool" } & ToolActivity)
  | { type: "error"; message: string };

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function createConversation(): Conversation {
  return {
    id: createId(),
    title: "New chat",
    messages: [],
    updatedAt: Date.now(),
  };
}

function EveApp() {
  const systemTheme = useColorScheme();
  const dark = systemTheme === "dark";
  const colors = dark ? darkColors : lightColors;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [provider, setProvider] = useState<Provider>("cursor");
  const [model, setModel] = useState("auto");
  const [models, setModels] = useState<ModelOption[]>(CURSOR_FALLBACK_MODELS);
  const [modelOpen, setModelOpen] = useState(false);
  const [expandedActivity, setExpandedActivity] = useState("");
  const [configurationStatus, setConfigurationStatus] = useState<
    "checking" | "ready" | "missing" | "offline"
  >("checking");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const active =
    conversations.find((conversation) => conversation.id === activeId) ??
    conversations[0];
  const filteredConversations = conversations.filter((conversation) => {
    const haystack = `${conversation.title} ${conversation.messages
      .map((message) => message.content)
      .join(" ")}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        const parsed = saved ? (JSON.parse(saved) as Conversation[]) : [];
        const initial = parsed.length ? parsed : [createConversation()];
        setConversations(initial);
        setActiveId(initial[0].id);
      })
      .catch(() => {
        const initial = createConversation();
        setConversations([initial]);
        setActiveId(initial.id);
      });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(PROVIDER_KEY).then((saved) => {
      if (saved === "cursor" || saved === "ollama") setProvider(saved);
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/health`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Health check failed.");
        return response.json() as Promise<{ status?: string }>;
      })
      .then((payload) =>
        setConfigurationStatus(
          payload.status === "ready" ? "ready" : "missing",
        ),
      )
      .catch((error) => {
        if (!(error instanceof Error && error.name === "AbortError")) {
          setConfigurationStatus("offline");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/models?provider=${provider}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load models.");
        return response.json() as Promise<{ models?: ModelOption[] }>;
      })
      .then(async (payload) => {
        const catalog = payload.models?.length ? payload.models : fallbackModels(provider);
        setModels(catalog);
        const saved = await AsyncStorage.getItem(modelKey(provider));
        if (saved && catalog.some((item) => item.id === saved)) {
          setModel(saved);
        } else {
          setModel(catalog[0].id);
        }
      })
      .catch((error) => {
        if (!(error instanceof Error && error.name === "AbortError")) {
          setModels(fallbackModels(provider));
        }
      });
    return () => controller.abort();
  }, [provider]);

  useEffect(() => {
    if (!conversations.length) return;
    const timeout = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(conversations)).catch(
        () => undefined,
      );
    }, 250);
    return () => clearTimeout(timeout);
  }, [conversations]);

  function updateActive(
    updater: (conversation: Conversation) => Conversation,
  ) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeId ? updater(conversation) : conversation,
      ),
    );
  }

  function newChat() {
    const conversation = createConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveId(conversation.id);
    setInput("");
    setAttachments([]);
    setMenuOpen(false);
  }

  function deleteChat(id: string) {
    const remaining = conversations.filter(
      (conversation) => conversation.id !== id,
    );
    if (remaining.length) {
      setConversations(remaining);
      if (activeId === id) setActiveId(remaining[0].id);
    } else {
      const replacement = createConversation();
      setConversations([replacement]);
      setActiveId(replacement.id);
    }
  }

  function renameChat(conversation: Conversation) {
    Alert.prompt(
      "Rename conversation",
      "Choose a short name that will be easy to find later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: (value?: string) => {
            const title = value?.trim();
            if (!title) return;
            setConversations((current) =>
              current.map((item) =>
                item.id === conversation.id
                  ? { ...item, title, updatedAt: Date.now() }
                  : item,
              ),
            );
          },
        },
      ],
      "plain-text",
      conversation.title,
    );
  }

  function conversationMarkdown(conversation: Conversation) {
    return [
      `# ${conversation.title}`,
      "",
      ...conversation.messages.flatMap((message) => [
        `## ${message.role === "assistant" ? "Eve" : "You"}`,
        "",
        message.content,
        "",
      ]),
    ].join("\n");
  }

  function conversationOptions(conversation: Conversation) {
    Alert.alert(conversation.title, undefined, [
      { text: "Rename", onPress: () => renameChat(conversation) },
      {
        text: "Share",
        onPress: () =>
          void Share.share({
            title: conversation.title,
            message: conversationMarkdown(conversation),
          }),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteChat(conversation.id),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function send(
    content: string,
    baseMessages = active?.messages ?? [],
    messageAttachments = attachments,
  ) {
    const trimmed = content.trim();
    if (!trimmed || !active || streaming) return;
    if (configurationStatus !== "ready") {
      Alert.alert(
        "Eve isn’t connected",
        configurationStatus === "missing"
          ? "The web deployment needs CURSOR_API_KEY configured."
          : "Check EXPO_PUBLIC_API_URL and your network connection.",
      );
      return;
    }

    const userMessage: Message = {
      id: createId(),
      role: "user",
      content: trimmed,
      attachments: messageAttachments.length ? messageAttachments : undefined,
    };
    const assistantMessage: Message = {
      id: createId(),
      role: "assistant",
      content: "",
    };
    const requestMessages = [...baseMessages, userMessage];
    setInput("");
    setAttachments([]);
    setStreaming(true);
    updateActive((conversation) => ({
      ...conversation,
      title:
        conversation.messages.length === 0
          ? trimmed.slice(0, 48)
          : conversation.title,
      messages: [...requestMessages, assistantMessage],
      updatedAt: Date.now(),
    }));

    const controller = new AbortController();
    abortRef.current = controller;
    let receivedText = "";
    let receivedAny = false;
    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          messages: requestMessages.map(
            ({ role, content: text, attachments: files }, index) => ({
              role,
              content: text,
              attachments:
                index === requestMessages.length - 1
                  ? files?.map(({ name, mediaType, data }) => ({
                      name,
                      mediaType,
                      data,
                    }))
                  : undefined,
            }),
          ),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Eve could not respond.");
      }

      let buffer = "";
      const applyEvent = (event: ChatStreamEvent) => {
        if (event.type === "error") throw new Error(event.message);
        receivedAny = true;
        if (event.type === "text") receivedText += event.delta;
        updateActive((conversation) => ({
          ...conversation,
          messages: conversation.messages.map((message) => {
            if (message.id !== assistantMessage.id) return message;
            if (event.type === "text") {
              return { ...message, content: receivedText };
            }
            if (event.type === "reasoning") {
              return {
                ...message,
                reasoning: `${message.reasoning ?? ""}${event.delta}`,
              };
            }
            const activities = message.activities ?? [];
            const existing = activities.findIndex((item) => item.id === event.id);
            return {
              ...message,
              activities:
                existing >= 0
                  ? activities.map((item) =>
                      item.id === event.id ? { ...item, ...event } : item,
                    )
                  : [...activities, event],
            };
          }),
        }));
      };
      const consumeLines = () => {
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) applyEvent(JSON.parse(line) as ChatStreamEvent);
        }
      };
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          consumeLines();
        }
        buffer += decoder.decode();
      } else {
        buffer = await response.text();
      }
      consumeLines();
      if (buffer.trim()) {
        applyEvent(JSON.parse(buffer) as ChatStreamEvent);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        updateActive((conversation) => ({
          ...conversation,
          messages: conversation.messages
            .map((message) =>
              message.id === assistantMessage.id && receivedAny && !message.content
                ? { ...message, content: "Generation stopped." }
                : message,
            )
            .filter(
              (message) => message.id !== assistantMessage.id || receivedAny,
            ),
        }));
        return;
      }
      const message =
        error instanceof Error ? error.message : "Something went wrong.";
      Alert.alert("Couldn’t send message", message);
      updateActive((conversation) => ({
        ...conversation,
        messages: conversation.messages
          .map((item) =>
            item.id === assistantMessage.id && receivedAny && !item.content
              ? { ...item, content: "The response ended before completion." }
              : item,
          )
          .filter((item) => item.id !== assistantMessage.id || receivedAny),
      }));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function regenerate() {
    if (!active || streaming) return;
    let lastUserIndex = -1;
    for (let index = active.messages.length - 1; index >= 0; index -= 1) {
      if (active.messages[index].role === "user") {
        lastUserIndex = index;
        break;
      }
    }
    if (lastUserIndex < 0) return;
    const prompt = active.messages[lastUserIndex].content;
    const base = active.messages.slice(0, lastUserIndex);
    updateActive((conversation) => ({ ...conversation, messages: base }));
    void send(prompt, base);
  }

  function editMessage(message: Message, index: number) {
    if (!active || streaming) return;
    Alert.prompt(
      "Edit message",
      "Changing this message will create a new response from here.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: (value?: string) => {
            const content = value?.trim();
            if (!content) return;
            const base = active.messages.slice(0, index);
            updateActive((conversation) => ({
              ...conversation,
              messages: base,
            }));
            void send(content, base, message.attachments ?? []);
          },
        },
      ],
      "plain-text",
      message.content,
    );
  }

  function messageOptions(message: Message, index: number) {
    Alert.alert(message.role === "assistant" ? "Eve’s response" : "Your message", undefined, [
      {
        text: "Copy",
        onPress: () => void Clipboard.setStringAsync(message.content),
      },
      ...(message.role === "user"
        ? [{ text: "Edit", onPress: () => editMessage(message, index) }]
        : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  async function pickImages() {
    const available = 3 - attachments.length;
    if (available <= 0) {
      Alert.alert("Attachment limit", "You can attach up to three images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: available,
      orderedSelection: true,
      base64: true,
      quality: 0.65,
    });
    if (result.canceled) return;
    const picked: Attachment[] = result.assets.flatMap((asset) => {
      if (!asset.base64) return [];
      return [
        {
          id: createId(),
          name: `${(asset.fileName ?? "photo").replace(/\.[^.]+$/, "")}.jpg`,
          mediaType: "image/jpeg",
          data: `data:image/jpeg;base64,${asset.base64}`,
        },
      ];
    });
    const totalSize = [...attachments, ...picked].reduce(
      (total, attachment) => total + attachment.data.length,
      0,
    );
    if (totalSize > 3_800_000) {
      Alert.alert(
        "Images too large",
        "Try selecting fewer images or screenshots with a smaller file size.",
      );
      return;
    }
    setAttachments((current) => [...current, ...picked]);
  }

  function selectModel(id: string) {
    setModel(id);
    setModelOpen(false);
    AsyncStorage.setItem(modelKey(provider), id).catch(() => undefined);
  }

  function selectProvider(nextProvider: Provider) {
    if (nextProvider === provider) return;
    setProvider(nextProvider);
    AsyncStorage.setItem(PROVIDER_KEY, nextProvider).catch(() => undefined);
    setModels(fallbackModels(nextProvider));
    AsyncStorage.getItem(modelKey(nextProvider)).then((saved) =>
      setModel(saved ?? fallbackModels(nextProvider)[0].id),
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar style={dark ? "light" : "dark"} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
        style={styles.flex}
      >
        <View style={[styles.header, { borderColor: colors.border }]}>
          <Pressable
            accessibilityLabel="Open conversations"
            hitSlop={12}
            onPress={() => setMenuOpen(true)}
          >
            <Ionicons color={colors.foreground} name="menu" size={24} />
          </Pressable>
          <Pressable
            accessibilityLabel="Choose model"
            onPress={() => setModelOpen(true)}
            style={styles.headerTitle}
          >
            <Text style={[styles.title, { color: colors.foreground }]}>Eve</Text>
            <View style={styles.modelLabel}>
              <Text style={[styles.model, { color: colors.muted }]}>
                {models.find((item) => item.id === model)?.displayName ?? model}
              </Text>
              <Ionicons color={colors.muted} name="chevron-down" size={11} />
            </View>
          </Pressable>
          <Pressable accessibilityLabel="New chat" hitSlop={12} onPress={newChat}>
            <Ionicons color={colors.foreground} name="create-outline" size={24} />
          </Pressable>
        </View>
        {configurationStatus !== "ready" && (
          <View
            style={[
              styles.connectionBanner,
              {
                backgroundColor: colors.secondary,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons
              color={configurationStatus === "checking" ? colors.muted : "#dc2626"}
              name={
                configurationStatus === "checking"
                  ? "sync"
                  : "alert-circle-outline"
              }
              size={18}
            />
            <View style={styles.connectionBannerBody}>
              <Text
                style={[
                  styles.connectionBannerTitle,
                  { color: colors.foreground },
                ]}
              >
                {configurationStatus === "checking"
                  ? "Connecting to Eve"
                  : configurationStatus === "missing"
                    ? "Cursor API key required"
                    : "Eve is offline"}
              </Text>
              <Text style={[styles.connectionBannerText, { color: colors.muted }]}>
                {configurationStatus === "checking"
                  ? "Checking the server configuration."
                  : configurationStatus === "missing"
                    ? "Configure CURSOR_API_KEY on the web deployment."
                    : "Check EXPO_PUBLIC_API_URL and your connection."}
              </Text>
            </View>
          </View>
        )}

        <ScrollView
          contentContainerStyle={
            active?.messages.length ? styles.messages : styles.empty
          }
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
          ref={scrollRef}
        >
          {!active?.messages.length ? (
            <View style={styles.welcome}>
              <View
                style={[
                  styles.logo,
                  { backgroundColor: colors.foreground },
                ]}
              >
                <Text style={[styles.logoText, { color: colors.background }]}>E</Text>
              </View>
              <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>
                How can I help you today?
              </Text>
              <Text style={[styles.welcomeBody, { color: colors.muted }]}>
                Ask a question, explore an idea, or work through a problem.
              </Text>
              {[
                "Explain a difficult topic simply",
                "Help me plan a weekend trip",
                "Draft a thoughtful email",
              ].map((suggestion) => (
                <Pressable
                  key={suggestion}
                  onPress={() => void send(suggestion)}
                  style={[styles.suggestion, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.foreground }}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            active.messages.map((message, index) => (
              <View style={styles.message} key={message.id}>
                <View
                  style={[
                    styles.avatar,
                    {
                      backgroundColor:
                        message.role === "assistant"
                          ? colors.foreground
                          : colors.secondary,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        message.role === "assistant"
                          ? colors.background
                          : colors.foreground,
                      fontWeight: "600",
                    }}
                  >
                    {message.role === "assistant" ? "E" : "Y"}
                  </Text>
                </View>
                <Pressable
                  accessibilityHint="Long-press for message actions"
                  onLongPress={() => messageOptions(message, index)}
                  style={styles.messageBody}
                >
                  <Text style={[styles.author, { color: colors.foreground }]}>
                    {message.role === "assistant" ? "Eve" : "You"}
                  </Text>
                  {message.role === "assistant" &&
                    (!!message.reasoning || !!message.activities?.length) && (
                      <View
                        style={[
                          styles.activity,
                          {
                            backgroundColor: colors.secondary,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Pressable
                          accessibilityLabel="Toggle model activity"
                          onPress={() =>
                            setExpandedActivity((current) =>
                              current === message.id ? "" : message.id,
                            )
                          }
                          style={styles.activityHeader}
                        >
                          <Ionicons
                            color={colors.muted}
                            name={
                              message.activities?.some(
                                (activity) => activity.status === "running",
                              )
                                ? "sync"
                                : "construct-outline"
                            }
                            size={16}
                          />
                          <Text
                            style={[styles.activityTitle, { color: colors.foreground }]}
                          >
                            Activity
                          </Text>
                          <Ionicons
                            color={colors.muted}
                            name={
                              expandedActivity === message.id
                                ? "chevron-up"
                                : "chevron-down"
                            }
                            size={16}
                          />
                        </Pressable>
                        {expandedActivity === message.id && (
                          <View style={styles.activityContent}>
                            {!!message.reasoning && (
                              <View>
                                <Text
                                  style={[
                                    styles.activityItemTitle,
                                    { color: colors.foreground },
                                  ]}
                                >
                                  Reasoning
                                </Text>
                                <Text
                                  style={[styles.activityReasoning, { color: colors.muted }]}
                                >
                                  {message.reasoning}
                                </Text>
                              </View>
                            )}
                            {message.activities?.map((activity) => (
                              <View style={styles.activityItem} key={activity.id}>
                                <Ionicons
                                  color={
                                    activity.status === "error"
                                      ? "#dc2626"
                                      : colors.muted
                                  }
                                  name={
                                    activity.status === "running"
                                      ? "sync"
                                      : activity.status === "complete"
                                        ? "checkmark-circle-outline"
                                        : "close-circle-outline"
                                  }
                                  size={16}
                                />
                                <Text style={{ color: colors.foreground, flex: 1 }}>
                                  {activity.title ??
                                    activity.name.replace(/[_-]+/g, " ")}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  {message.content ? (
                    <>
                      {!!message.attachments?.length && (
                        <ScrollView
                          contentContainerStyle={styles.messageAttachments}
                          horizontal
                          showsHorizontalScrollIndicator={false}
                        >
                          {message.attachments.map((attachment) => (
                            <Image
                              accessibilityLabel={attachment.name}
                              key={attachment.id}
                              source={{ uri: attachment.data }}
                              style={[styles.messageImage, { borderColor: colors.border }]}
                            />
                          ))}
                        </ScrollView>
                      )}
                      <Text
                        selectable
                        style={{
                          color: colors.foreground,
                          fontSize: 16,
                          lineHeight: 24,
                        }}
                      >
                        {message.content}
                      </Text>
                    </>
                  ) : (
                    <ActivityIndicator
                      color={colors.muted}
                      size="small"
                      style={styles.loading}
                    />
                  )}
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>

        <View style={[styles.composerArea, { backgroundColor: colors.background }]}>
          {!!active?.messages.length && !streaming && (
            <Pressable
              onPress={regenerate}
              style={[styles.regenerate, { borderColor: colors.border }]}
            >
              <Ionicons color={colors.foreground} name="refresh" size={16} />
              <Text style={{ color: colors.foreground }}>Regenerate</Text>
            </Pressable>
          )}
          {!!attachments.length && (
            <ScrollView
              contentContainerStyle={styles.attachmentStrip}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {attachments.map((attachment) => (
                <View key={attachment.id}>
                  <Image
                    accessibilityLabel={attachment.name}
                    source={{ uri: attachment.data }}
                    style={[styles.attachmentImage, { borderColor: colors.border }]}
                  />
                  <Pressable
                    accessibilityLabel={`Remove ${attachment.name}`}
                    onPress={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.id !== attachment.id),
                      )
                    }
                    style={[
                      styles.removeAttachment,
                      { backgroundColor: colors.foreground },
                    ]}
                  >
                    <Ionicons color={colors.background} name="close" size={13} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
          <View
            style={[
              styles.composer,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Pressable
              accessibilityLabel="Attach images"
              disabled={
                configurationStatus !== "ready" ||
                streaming ||
                attachments.length >= 3
              }
              hitSlop={8}
              onPress={() => void pickImages()}
              style={styles.attach}
            >
              <Ionicons
                color={
                  configurationStatus !== "ready" ||
                  streaming ||
                  attachments.length >= 3
                    ? colors.muted
                    : colors.foreground
                }
                name="add"
                size={22}
              />
            </Pressable>
            <TextInput
              accessibilityLabel="Message Eve"
              multiline
              onChangeText={setInput}
              placeholder="Message Eve"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.foreground }]}
              value={input}
            />
            <Pressable
              accessibilityLabel={streaming ? "Stop generating" : "Send message"}
              disabled={
                !streaming &&
                (configurationStatus !== "ready" || !input.trim())
              }
              onPress={() =>
                streaming ? abortRef.current?.abort() : void send(input)
              }
              style={[
                styles.send,
                {
                  backgroundColor:
                    streaming || input.trim()
                      ? colors.foreground
                      : colors.secondary,
                },
              ]}
            >
              <Ionicons
                color={
                  streaming || input.trim() ? colors.background : colors.muted
                }
                name={streaming ? "stop" : "arrow-up"}
                size={18}
              />
            </Pressable>
          </View>
          <Text style={[styles.disclaimer, { color: colors.muted }]}>
            Eve can make mistakes. Check important information.
          </Text>
        </View>

        <Modal
          animationType="slide"
          onRequestClose={() => setModelOpen(false)}
          presentationStyle="pageSheet"
          visible={modelOpen}
        >
          <SafeAreaView
            style={[styles.safeArea, { backgroundColor: colors.background }]}
          >
            <View style={[styles.menuHeader, { borderColor: colors.border }]}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>
                Choose a model
              </Text>
              <Pressable
                accessibilityLabel="Close model selector"
                onPress={() => setModelOpen(false)}
              >
                <Ionicons color={colors.foreground} name="close" size={26} />
              </Pressable>
            </View>
            <View style={styles.providerToggleGroup}>
              {(["cursor", "ollama"] as const).map((item) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: provider === item }}
                  key={item}
                  onPress={() => selectProvider(item)}
                  style={[
                    styles.providerToggle,
                    { borderColor: colors.border },
                    provider === item && { backgroundColor: colors.secondary },
                  ]}
                >
                  <Text style={{ color: colors.foreground }}>
                    {item === "cursor" ? "Cursor" : "Ollama Cloud"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <FlatList
              contentContainerStyle={styles.modelList}
              data={models}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => selectModel(item.id)}
                  style={[
                    styles.modelOption,
                    { borderColor: colors.border },
                    item.id === model && { backgroundColor: colors.secondary },
                  ]}
                >
                  <View style={styles.modelOptionBody}>
                    <Text
                      style={[styles.modelOptionTitle, { color: colors.foreground }]}
                    >
                      {item.displayName}
                    </Text>
                    {!!item.description && (
                      <Text style={[styles.modelOptionDescription, { color: colors.muted }]}>
                        {item.description}
                      </Text>
                    )}
                  </View>
                  {item.id === model && (
                    <Ionicons color={colors.foreground} name="checkmark" size={20} />
                  )}
                </Pressable>
              )}
            />
          </SafeAreaView>
        </Modal>

        <Modal
          animationType="slide"
          onRequestClose={() => setMenuOpen(false)}
          presentationStyle="pageSheet"
          visible={menuOpen}
        >
          <SafeAreaView
            style={[styles.safeArea, { backgroundColor: colors.background }]}
          >
            <View style={[styles.menuHeader, { borderColor: colors.border }]}>
              <Text style={[styles.menuTitle, { color: colors.foreground }]}>
                Conversations
              </Text>
              <Pressable
                accessibilityLabel="Close conversations"
                onPress={() => setMenuOpen(false)}
              >
                <Ionicons color={colors.foreground} name="close" size={26} />
              </Pressable>
            </View>
            <Pressable
              onPress={newChat}
              style={[styles.newChat, { borderColor: colors.border }]}
            >
              <Ionicons color={colors.foreground} name="add" size={20} />
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                New chat
              </Text>
            </Pressable>
            <View
              style={[
                styles.searchBox,
                { borderColor: colors.border },
              ]}
            >
              <Ionicons color={colors.muted} name="search" size={18} />
              <TextInput
                accessibilityLabel="Search conversations"
                onChangeText={setQuery}
                placeholder="Search chats"
                placeholderTextColor={colors.muted}
                style={[styles.searchInput, { color: colors.foreground }]}
                value={query}
              />
            </View>
            <FlatList
              data={filteredConversations}
              ListEmptyComponent={
                <Text style={[styles.noResults, { color: colors.muted }]}>
                  No conversations found.
                </Text>
              }
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onLongPress={() => conversationOptions(item)}
                  onPress={() => {
                    setActiveId(item.id);
                    setMenuOpen(false);
                  }}
                  style={[
                    styles.conversation,
                    item.id === activeId && {
                      backgroundColor: colors.secondary,
                    },
                  ]}
                >
                  <Ionicons
                    color={colors.foreground}
                    name="chatbubble-outline"
                    size={18}
                  />
                  <Text
                    numberOfLines={1}
                    style={[styles.conversationTitle, { color: colors.foreground }]}
                  >
                    {item.title}
                  </Text>
                </Pressable>
              )}
            />
            <Text style={[styles.menuHint, { color: colors.muted }]}>
              Long-press a conversation for more options.
            </Text>
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <EveApp />
    </SafeAreaProvider>
  );
}

const lightColors = {
  background: "#ffffff",
  foreground: "#18181b",
  secondary: "#f4f4f5",
  muted: "#71717a",
  border: "#e4e4e7",
};

const darkColors = {
  background: "#18181b",
  foreground: "#fafafa",
  secondary: "#27272a",
  muted: "#a1a1aa",
  border: "#3f3f46",
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    height: 52,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { alignItems: "center" },
  modelLabel: { flexDirection: "row", alignItems: "center", gap: 2 },
  title: { fontWeight: "700", fontSize: 17 },
  model: { fontSize: 11 },
  connectionBanner: {
    margin: 10,
    marginBottom: 0,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  connectionBannerBody: { flex: 1 },
  connectionBannerTitle: { fontSize: 14, fontWeight: "600" },
  connectionBannerText: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  messages: { paddingHorizontal: 16, paddingVertical: 24 },
  empty: { flexGrow: 1, justifyContent: "center", padding: 20 },
  welcome: { alignItems: "center", gap: 12 },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  logoText: { fontSize: 20, fontWeight: "700" },
  welcomeTitle: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  welcomeBody: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 21,
  },
  suggestion: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    width: "100%",
  },
  message: { flexDirection: "row", gap: 10, marginBottom: 28 },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  messageBody: { flex: 1 },
  author: { fontSize: 14, fontWeight: "700", marginBottom: 3 },
  loading: { alignSelf: "flex-start", marginTop: 8 },
  composerArea: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4 },
  composer: {
    minHeight: 54,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    paddingLeft: 7,
    paddingRight: 7,
    paddingVertical: 7,
  },
  input: { flex: 1, fontSize: 16, maxHeight: 120, paddingVertical: 8 },
  attach: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
  send: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  disclaimer: { textAlign: "center", fontSize: 11, paddingVertical: 6 },
  regenerate: {
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  menuHeader: {
    height: 54,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuTitle: { fontSize: 18, fontWeight: "700" },
  newChat: {
    margin: 14,
    padding: 14,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  conversation: {
    marginHorizontal: 10,
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  conversationTitle: { flex: 1, fontSize: 15 },
  menuHint: { padding: 16, textAlign: "center", fontSize: 12 },
  searchBox: {
    marginHorizontal: 14,
    marginBottom: 6,
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  noResults: { padding: 28, textAlign: "center" },
  modelList: { padding: 14, gap: 8 },
  providerToggleGroup: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingTop: 12 },
  providerToggle: { alignItems: "center", borderWidth: 1, borderRadius: 10, flex: 1, paddingVertical: 10 },
  modelOption: {
    minHeight: 62,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modelOptionBody: { flex: 1 },
  modelOptionTitle: { fontSize: 16, fontWeight: "600" },
  modelOptionDescription: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  attachmentStrip: { gap: 10, paddingHorizontal: 4, paddingTop: 4, paddingBottom: 10 },
  attachmentImage: {
    width: 68,
    height: 68,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  removeAttachment: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  messageAttachments: { gap: 8, paddingBottom: 10 },
  messageImage: {
    width: 180,
    height: 135,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  activity: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    marginBottom: 10,
    overflow: "hidden",
  },
  activityHeader: {
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activityTitle: { flex: 1, fontSize: 14, fontWeight: "600" },
  activityContent: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  activityItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  activityItemTitle: { fontSize: 13, fontWeight: "600", marginBottom: 3 },
  activityReasoning: { fontSize: 13, lineHeight: 19 },
});
