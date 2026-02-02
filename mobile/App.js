import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  AppState,
  Vibration,
  Easing,
  NativeModules,
  useWindowDimensions,
  useColorScheme,
  Animated,
  BackHandler,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

const DARK_COLORS = {
  bg: "#0f1418",
  bg2: "#0b0f12",
  card: "#111820",
  card2: "#0c1218",
  ink: "#eaf0f6",
  muted: "#b9c4d0",
  accent: "#7bd9ff",
  accent2: "#b1ff9e",
  danger: "#ffb26b",
  line: "#1d2a35",
};

const LIGHT_COLORS = {
  bg: "#f5f7fa",
  bg2: "#edf1f5",
  card: "#ffffff",
  card2: "#f3f6f9",
  ink: "#0f1418",
  muted: "#4a5865",
  accent: "#1f7aa8",
  accent2: "#2c9f5d",
  danger: "#c97328",
  line: "#d7e0e7",
};

const getColors = (scheme) => (scheme === "dark" ? DARK_COLORS : LIGHT_COLORS);
const withAlpha = (hex, alpha) => {
  if (!hex || hex[0] !== "#" || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const levels = [20, 45, 75, 110];
const levelNames = [
  "Habit Lock",
  "Load Tolerance",
  "Accumulation Capacity",
  "Sustainable Performance",
];
const challenges = [
  "ARC-only week. No power or power-endurance.",
  "Mobility every day. One session doubled.",
  "Silent sessions. No music/podcasts.",
  "Left/right-side priority. Start on weaker side.",
  "Technique-only: drop 1–2 grades, perfect form.",
  "No-pump rule: stop when pump starts.",
  "Long holds: fewer reps, longer positions.",
  "Minimum-only week. No bonus sessions.",
  "Form-first: end set at first breakdown.",
  "Deliberate recovery: add one extra recovery day.",
  "Time-blind sessions. No clock checking.",
  "Reduced volume 30–40%, same quality.",
  "Position ownership audit: re-test key positions.",
];

const bodyChecks = [
  { id: "fingers", label: "Fingers feel stiff", tags: ["crimp"] },
  { id: "elbows", label: "Elbows feel tender", tags: ["pull"] },
  { id: "shoulders", label: "Shoulders feel tight", tags: ["shoulder"] },
  { id: "none", label: "Nothing notable", tags: [] },
];

const noteLimiters = [
  { id: "grip", label: "Grip / forearms" },
  { id: "mobility", label: "Hips / mobility" },
  { id: "power", label: "Power" },
  { id: "endurance", label: "Endurance" },
  { id: "focus", label: "Focus / attention" },
  { id: "none", label: "Nothing felt limiting" },
];

const noteFeels = [
  { id: "easy", label: "Easy" },
  { id: "controlled", label: "Controlled" },
  { id: "hard_clean", label: "Hard but clean" },
  { id: "sloppy", label: "Sloppy / fatigued" },
];

const TIMER_MODES = [
  { id: "free", label: "Free" },
  { id: "intervals", label: "Intervals" },
  { id: "silent", label: "Silent" },
];

const quotes = [
  { text: "Ten minutes beats zero. Zero beats nothing except your ego.", tags: ["anchor"] },
  { text: "Nothing dramatic happens today. That's the point.", tags: ["anchor"] },
  { text: "Discomfort is the entry fee, not the goal.", tags: ["anchor"] },
  { text: "The session that feels pointless is the one that counts.", tags: ["neutral"] },
  { text: "You don't rise to motivation. You sink to your systems.", tags: ["neutral"] },
  { text: "Consistency is boredom executed well.", tags: ["neutral"] },
  { text: "Future strength is built on unremarkable days.", tags: ["neutral"] },
  { text: "Start small. Start now. Adjust later.", tags: ["neutral"] },
  { text: "Do the minimum. Let momentum handle the rest.", tags: ["neutral"] },
  { text: "One rep is infinitely more than thinking about reps.", tags: ["neutral"] },
  { text: "This is maintenance, not self-improvement.", tags: ["neutral"] },
  { text: "The body remembers what the mind avoids.", tags: ["neutral"] },
  { text: "Start before you're ready. Readiness is a delay tactic.", tags: ["hard"] },
  { text: "The urge to skip is the signal.", tags: ["hard"] },
  { text: "If it feels optional, it isn't.", tags: ["hard"] },
  { text: "Miss intensity, not days.", tags: ["hard"] },
  { text: "I train because this is what climbers do.", tags: ["identity"] },
  { text: "I don't negotiate with the version of me that wants comfort.", tags: ["identity"] },
  { text: "Some weeks are for showing up, not proving anything.", tags: ["soft"] },
  { text: "Rest is part of the plan, not a detour.", tags: ["soft"] },
  { text: "You can restart without making it dramatic.", tags: ["soft"] },
];

const pad2 = (value) => String(value).padStart(2, "0");
const formatLocalDate = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const parseLocalDate = (value) => {
  if (value instanceof Date) return new Date(value);
  if (typeof value === "string") {
    const [year, month, day] = value.split("-").map((part) => Number(part));
    if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
      return new Date(year, month - 1, day);
    }
  }
  return new Date(value);
};

const pickQuote = (seedKey, pool) => {
  const list = pool.length ? pool : quotes;
  let seed = 0;
  for (let i = 0; i < seedKey.length; i += 1) seed += seedKey.charCodeAt(i);
  return list[seed % list.length];
};
const challengeKey = (week) => `climb-routine:challenge:${week}`;
const notifyIdKey = "climb-routine:notifyId";
const notifyTimeKey = "climb-routine:notifyTime";

const getWeekStart = (d) => {
  const date = parseLocalDate(d);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  return formatLocalDate(date);
};

const addDays = (d, amount) => {
  const date = parseLocalDate(d);
  date.setDate(date.getDate() + amount);
  return formatLocalDate(date);
};

const formatTime = (ms) => {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
};

const DEFAULT_NOTIFY_MINUTES = 19 * 60 + 30;
const roundToNearest = (value, step) => Math.round(value / step) * step;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  const colorScheme = useColorScheme();
  const colors = useMemo(() => getColors(colorScheme), [colorScheme]);
  const styles = useMemo(
    () => createStyles(colors, colorScheme === "dark"),
    [colors, colorScheme]
  );
  const { width } = useWindowDimensions();
  const [today, setToday] = useState(() => new Date());
  const [dateKey, setDateKey] = useState(() => formatLocalDate(new Date()));
  const dateText = useMemo(
    () =>
      today.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [today]
  );
  const [storageMap, setStorageMap] = useState({});
  const [storageReady, setStorageReady] = useState(false);
  const [weeklyChallenge, setWeeklyChallenge] = useState("—");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [timerModeIndex, setTimerModeIndex] = useState(0);
  const TimerService = Platform.OS === "android" ? NativeModules.TimerService : null;
  const timerMode = TIMER_MODES[timerModeIndex]?.id ?? "free";
  const timerModeLabel = TIMER_MODES[timerModeIndex]?.label ?? "Free";

  const dailyKey = useCallback(
    (item, day = dateKey) => `climb-routine:${item}:${day}`,
    [dateKey]
  );
  const xpKey = useCallback((day = dateKey) => `climb-routine:xp:${day}`, [dateKey]);
  const bodyCheckKey = useCallback(
    (day = dateKey) => `climb-routine:body-check:${day}`,
    [dateKey]
  );
  const doneAtKey = useCallback(
    (day = dateKey) => `climb-routine:doneAt:${day}`,
    [dateKey]
  );
  const noteKey = useCallback(
    (group, item, day = dateKey) => `climb-routine:note:${group}:${item}:${day}`,
    [dateKey]
  );
  const streakCareKey = "climb-routine:streak-care-note-seen";
  const maintenanceKey = "climb-routine:maintenance-mode";
  const commitmentKey = "climb-routine:commitment-accepted";

  const refreshDate = useCallback(() => {
    const now = new Date();
    const nextKey = formatLocalDate(now);
    setToday(now);
    setDateKey((prev) => (prev === nextKey ? prev : nextKey));
  }, []);

  const [timerElapsed, setTimerElapsed] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerStart = useRef(0);
  const timerInterval = useRef(null);
  const timerLastSecond = useRef(-1);
  const timerLastNotified = useRef(-1);
  const timerFade = useRef(new Animated.Value(1)).current;
  const timerFadeTimeout = useRef(null);
  const timerResetScale = useRef(new Animated.Value(1)).current;
  const pagerRef = useRef(null);
  const exercisesScrollRef = useRef(null);
  const exerciseLayoutRef = useRef({});

  const soundsRef = useRef({});
  const streakScale = useRef(new Animated.Value(1)).current;
  const streakGlow = useRef(new Animated.Value(0)).current;
  const [bodyCheckExpanded, setBodyCheckExpanded] = useState(true);
  const [bodyCheckManualOpen, setBodyCheckManualOpen] = useState(false);
  const maintenancePulse = useRef(new Animated.Value(0)).current;
  const [showCommitment, setShowCommitment] = useState(false);
  const [commitText, setCommitText] = useState("");
  const commitFade = useRef(new Animated.Value(0)).current;
  const commitScale = useRef(new Animated.Value(0.98)).current;

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }, []);

  useEffect(() => {
    const handleAppState = (nextState) => {
      if (nextState === "active") refreshDate();
    };
    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, [refreshDate]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const keys = await AsyncStorage.getAllKeys();
      const pairs = await AsyncStorage.multiGet(keys);
      const map = {};
      pairs.forEach(([key, value]) => {
        if (value != null) map[key] = value;
      });
      if (mounted) {
        setStorageMap(map);
        setStorageReady(true);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const SOUND_ENABLED = Platform.OS === "android";

  useEffect(() => {
    let mounted = true;
    const loadSounds = async () => {
      if (!SOUND_ENABLED) {
        if (mounted) soundsRef.current = {};
        return;
      }
      try {
        const audio = require("expo-audio");
        const createAudioPlayer = audio?.createAudioPlayer;
        const setAudioModeAsync = audio?.setAudioModeAsync;
        if (!createAudioPlayer || !setAudioModeAsync) {
          if (mounted) soundsRef.current = {};
          return;
        }
        await setAudioModeAsync({
          shouldPlayInBackground: true,
          playsInSilentMode: true,
          interruptionMode: "mixWithOthers",
          interruptionModeAndroid: "duckOthers",
        });
        const timer10 = createAudioPlayer(
          require("./assets/audio/10s_neutral_click.wav")
        );
        const timer30 = createAudioPlayer(
          require("./assets/audio/30s_firm_click.wav")
        );
        const timer60 = createAudioPlayer(
          require("./assets/audio/60s_completion_tone.wav")
        );
        const complete = createAudioPlayer(
          require("./assets/audio/exercise_complete_reward_click.wav")
        );
        if (mounted) {
          soundsRef.current = { timer10, timer30, timer60, complete };
        } else {
          timer10.release();
          timer30.release();
          timer60.release();
          complete.release();
        }
      } catch (_e) {
        if (mounted) soundsRef.current = {};
      }
    };
    loadSounds();
    return () => {
      mounted = false;
      const sounds = soundsRef.current;
      Object.values(sounds).forEach((sound) => {
        if (sound && sound.release) sound.release();
      });
    };
  }, [SOUND_ENABLED]);

  const playSound = async (name) => {
    if (!SOUND_ENABLED) return;
    const sound = soundsRef.current[name];
    if (!sound) return;
    try {
      sound.seekTo(0);
      sound.play();
    } catch (_e) {
      // Ignore audio errors (e.g. no user interaction yet).
    }
  };

  const getStored = (key) => storageMap[key] ?? null;
  const isChecked = (item, day = dateKey) => getStored(dailyKey(item, day)) === "1";
  const isNoteChecked = (group, item, day = dateKey) =>
    getStored(noteKey(group, item, day)) === "1";
  const bodyCheckValue = getStored(bodyCheckKey()) ?? "";
  const bodyCheckLabel =
    bodyChecks.find((opt) => opt.id === bodyCheckValue)?.label ?? "";
  const bodySteer = useMemo(() => {
    const match = bodyChecks.find((opt) => opt.id === bodyCheckValue);
    return new Set(match ? match.tags : []);
  }, [bodyCheckValue]);
  const maintenanceMode = getStored(maintenanceKey) === "1";
  const showStreakNote = !storageMap[streakCareKey];
  const commitmentAccepted = storageMap[commitmentKey] === "1";
  const commitReady = commitText === "I commit";

  useEffect(() => {
    setBodyCheckManualOpen(false);
    setBodyCheckExpanded(!bodyCheckValue);
  }, [dateKey]);

  useEffect(() => {
    if (!bodyCheckValue) {
      setBodyCheckExpanded(true);
      setBodyCheckManualOpen(false);
      return;
    }
    if (!bodyCheckManualOpen) setBodyCheckExpanded(false);
  }, [bodyCheckValue, bodyCheckManualOpen]);

  useEffect(() => {
    if (!showStreakNote) return;
    AsyncStorage.setItem(streakCareKey, "1").then(() => {
      setStorageMap((prev) => ({ ...prev, [streakCareKey]: "1" }));
    });
  }, [showStreakNote, streakCareKey]);

  useEffect(() => {
    if (!storageReady || commitmentAccepted) return;
    const timer = setTimeout(() => {
      setShowCommitment(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [storageReady, commitmentAccepted]);

  useEffect(() => {
    if (!showCommitment) return;
    commitFade.setValue(0);
    commitScale.setValue(0.98);
    Animated.parallel([
      Animated.timing(commitFade, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(commitScale, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [showCommitment, commitFade, commitScale]);

  useEffect(() => {
    if (!maintenanceMode) return;
    if (isChecked("pe")) {
      setChecked("pe", false);
    }
  }, [maintenanceMode]);

  useEffect(() => {
    if (!maintenanceMode) {
      maintenancePulse.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(maintenancePulse, {
          toValue: 1,
          duration: 4000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(maintenancePulse, {
          toValue: 0,
          duration: 4000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [maintenanceMode, maintenancePulse]);

  const setStored = async (key, value) => {
    await AsyncStorage.setItem(key, value);
    setStorageMap((prev) => ({ ...prev, [key]: value }));
  };

  const removeStored = async (key) => {
    await AsyncStorage.removeItem(key);
    setStorageMap((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const setChecked = async (item, value, day = dateKey) => {
    await setStored(dailyKey(item, day), value ? "1" : "0");
  };

  const setNoteChecked = async (group, item, value, day = dateKey) => {
    await setStored(noteKey(group, item, day), value ? "1" : "0");
  };

  const recordCompletionTime = async () => {
    const key = doneAtKey();
    if (storageMap[key]) return;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    await setStored(key, String(minutes));
  };

  const getRecentCompletionMinutes = (daysBack = 14) => {
    const result = [];
    const cursor = new Date(today);
    for (let i = 0; i < daysBack; i += 1) {
      const key = formatLocalDate(cursor);
      const stored = storageMap[doneAtKey(key)];
      if (stored) {
        const minutes = Number(stored);
        if (!Number.isNaN(minutes)) result.push(minutes);
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return result;
  };

  const ensureNotificationSchedule = async () => {
    if (!notificationsEnabled) return;
    const recent = getRecentCompletionMinutes(14);
    let targetMinutes = DEFAULT_NOTIFY_MINUTES;
    if (recent.length >= 3) {
      const avg = recent.reduce((sum, m) => sum + m, 0) / recent.length;
      targetMinutes = roundToNearest(avg, 5);
    }

    const storedTime = Number(storageMap[notifyTimeKey] || "0");
    const storedId = storageMap[notifyIdKey];
    if (storedId && storedTime === targetMinutes) return;

    if (storedId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(storedId);
      } catch (_e) {
        // Ignore if already canceled.
      }
    }

    const hour = Math.floor(targetMinutes / 60);
    const minute = targetMinutes % 60;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Climbing routine",
        body: "Time for today's routine.",
        channelId: "daily",
      },
      trigger: {
        hour,
        minute,
        repeats: true,
      },
    });

    await setStored(notifyIdKey, id);
    await setStored(notifyTimeKey, String(targetMinutes));
  };

  const startTimerInterval = () => {
    timerInterval.current = setInterval(() => {
      const elapsed = Date.now() - timerStart.current;
      const seconds = Math.floor(elapsed / 1000);
      if (seconds !== timerLastSecond.current) {
        timerLastSecond.current = seconds;
        if (Platform.OS !== "android") {
          if (timerMode === "intervals") {
            if (seconds > 0 && seconds % 60 === 0) {
              playSound("timer60");
            } else if (seconds > 0 && seconds % 30 === 0) {
              playSound("timer30");
            } else if (seconds > 0 && seconds % 10 === 0) {
              playSound("timer10");
            }
          } else if (timerMode === "free") {
            if (seconds > 0 && seconds % 60 === 0) {
              playSound("timer60");
            }
          } else if (timerMode === "silent") {
            if (seconds > 0 && seconds % 60 === 0) {
              Vibration.vibrate(30);
            } else if (seconds > 0 && seconds % 30 === 0) {
              Vibration.vibrate(20);
            } else if (seconds > 0 && seconds % 10 === 0) {
              Vibration.vibrate(10);
            }
          }
        }
        if (TimerService?.update && seconds !== timerLastNotified.current) {
          timerLastNotified.current = seconds;
          TimerService.update(seconds * 1000);
        }
      }
      setTimerElapsed(elapsed);
    }, 250);
  };

  const stopTimer = () => {
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
    setTimerRunning(false);
    Vibration.vibrate(5);
    if (TimerService?.stop) {
      TimerService.stop();
    }
  };

  const startTimer = () => {
    if (timerRunning) return;
    Vibration.vibrate(5);
    timerStart.current = Date.now() - (timerElapsed || 0);
    timerLastSecond.current = Math.floor((timerElapsed || 0) / 1000);
    timerLastNotified.current = timerLastSecond.current;
    setTimerRunning(true);
    if (TimerService?.start) {
      TimerService.start(timerElapsed || 0, timerMode);
    }
    startTimerInterval();
  };

  const resetTimer = () => {
    Vibration.vibrate(5);
    Animated.sequence([
      Animated.timing(timerResetScale, {
        toValue: 0.92,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.spring(timerResetScale, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();
    stopTimer();
    timerLastSecond.current = -1;
    setTimerElapsed(0);
  };

  const cycleTimerMode = () => {
    Vibration.vibrate(5);
    setTimerModeIndex((prev) => {
      const next = (prev + 1) % TIMER_MODES.length;
      return next;
    });
  };

  const registerTimerActivity = () => {
    if (timerFadeTimeout.current) clearTimeout(timerFadeTimeout.current);
    Animated.timing(timerFade, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();
    timerFadeTimeout.current = setTimeout(() => {
      Animated.timing(timerFade, {
        toValue: 0.45,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, 4500);
  };

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (timerRunning) {
          const elapsed = Date.now() - timerStart.current;
          timerLastSecond.current = Math.floor(elapsed / 1000);
          setTimerElapsed(elapsed);
          setTimeout(() => {
            if (timerRunning) {
              setTimerElapsed(Date.now() - timerStart.current);
            }
          }, 50);
          if (TimerService?.update) {
            const seconds = Math.floor(elapsed / 1000);
            timerLastNotified.current = seconds;
            TimerService.update(seconds * 1000);
          }
          if (!timerInterval.current) {
            if (TimerService?.start) {
              TimerService.start(elapsed, timerMode);
            }
            startTimerInterval();
          }
        }
      }
    });
    return () => sub.remove();
  }, [timerRunning, timerMode]);

  useEffect(() => {
    registerTimerActivity();
    if (timerRunning && TimerService?.setMode) {
      TimerService.setMode(timerMode);
    }
  }, [timerMode]);

  useEffect(() => {
    const weekStart = getWeekStart(today);
    const key = challengeKey(weekStart);
    const existing = storageMap[key];
    if (existing) {
      setWeeklyChallenge(existing);
      return;
    }
    const next = challenges[Math.floor(Math.random() * challenges.length)];
    setWeeklyChallenge(next);
    AsyncStorage.setItem(key, next).then(() => {
      setStorageMap((prev) => ({ ...prev, [key]: next }));
    });
  }, [storageMap, dateKey, today, dailyKey]);

  useEffect(() => {
    let mounted = true;
    const setupNotifications = async () => {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("daily", {
          name: "Daily Routine",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== "granted") {
        const request = await Notifications.requestPermissionsAsync();
        status = request.status;
      }
      if (mounted) setNotificationsEnabled(status === "granted");
    };
    setupNotifications();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    ensureNotificationSchedule();
  }, [storageMap, notificationsEnabled]);


  const recoveryActive = isChecked("recovery");
  const minimumDone = isChecked("mobility");
  const graceActive = isChecked("skip");
  const bodySignalActive = bodyCheckValue && bodyCheckValue !== "none";
  const bonusDone = ["arc", "pe", "support", "shoulder"]
    .filter((item) => isChecked(item)).length;
  const completedToday = ["mobility", "flex", "arc", "pe", "support", "shoulder"]
    .some((item) => isChecked(item));

  const graceCount14 = useMemo(() => {
    let count = 0;
    for (let i = 0; i < 14; i += 1) {
      const key = addDays(dateKey, -i);
      if (storageMap[dailyKey("skip", key)] === "1") count += 1;
    }
    return count;
  }, [storageMap, dateKey, dailyKey]);

  const lastCompletionGap = useMemo(() => {
    for (let i = 0; i < 30; i += 1) {
      const key = addDays(dateKey, -i);
      if (
        storageMap[dailyKey("mobility", key)] === "1" ||
        storageMap[dailyKey("skip", key)] === "1"
      ) {
        return i;
      }
    }
    return null;
  }, [storageMap, dateKey, dailyKey]);

  const recoveryExtended =
    recoveryActive && storageMap[dailyKey("recovery", addDays(dateKey, -1))] === "1";
  const streakBroken =
    !minimumDone &&
    !graceActive &&
    lastCompletionGap !== null &&
    lastCompletionGap >= 2;
  const softLanding = streakBroken || graceCount14 >= 2 || recoveryExtended;

  const quote = useMemo(() => {
    const pickFrom = (tags) =>
      quotes.filter((q) => q.tags && q.tags.some((tag) => tags.includes(tag)));

    if (softLanding) {
      return pickQuote(`${dateKey}:soft`, pickFrom(["soft"]));
    }
    if (completedToday && !recoveryActive && !graceActive) {
      return pickQuote(`${dateKey}:post`, pickFrom(["anchor", "neutral", "identity"]));
    }
    if (bodySignalActive || recoveryActive || graceActive) {
      return pickQuote(`${dateKey}:gentle`, pickFrom(["anchor", "neutral"]));
    }
    return pickQuote(`${dateKey}:default`, pickFrom(["anchor", "neutral", "hard"]));
  }, [
    dateKey,
    bodySignalActive,
    recoveryActive,
    graceActive,
    completedToday,
    softLanding,
  ]);

  const todayXp = useMemo(() => {
    if (recoveryActive) return 1;
    let xp = 0;
    if (isChecked("mobility")) xp += 1;
    if (isChecked("arc")) xp += 2;
    if (isChecked("pe")) xp += 3;
    if (isChecked("support")) xp += 1;
    if (isChecked("flex")) xp += 1;
    return xp;
  }, [storageMap]);

  useEffect(() => {
    const key = xpKey();
    const stored = Number(storageMap[key] || "0");
    if (stored !== todayXp) {
      AsyncStorage.setItem(key, String(todayXp)).then(() => {
        setStorageMap((prev) => ({ ...prev, [key]: String(todayXp) }));
      });
    }
  }, [todayXp, storageMap]);

  useEffect(() => {
    if (minimumDone && isChecked("skip")) {
      setChecked("skip", false);
    }
  }, [minimumDone, storageMap]);

  const totalXp = useMemo(() => {
    return Object.keys(storageMap)
      .filter((k) => k.startsWith("climb-routine:xp:"))
      .reduce((sum, k) => sum + Number(storageMap[k] || "0"), 0);
  }, [storageMap]);

  const levelInfo = useMemo(() => {
    let level = 1;
    let next = levels[0];
    let progress = totalXp / next;
    if (totalXp >= levels[3]) {
      level = 4;
      next = levels[3];
      progress = 1;
    } else if (totalXp >= levels[2]) {
      level = 4;
      next = levels[3];
      progress = (totalXp - levels[2]) / (levels[3] - levels[2]);
    } else if (totalXp >= levels[1]) {
      level = 3;
      next = levels[2];
      progress = (totalXp - levels[1]) / (levels[2] - levels[1]);
    } else if (totalXp >= levels[0]) {
      level = 2;
      next = levels[1];
      progress = (totalXp - levels[0]) / (levels[1] - levels[0]);
    }
    const cap = totalXp >= levels[3] ? levels[3] : next;
    return {
      progress: Math.min(progress, 1),
      label: `${levelNames[level - 1]} · ${Math.min(totalXp, cap)} / ${cap}`,
    };
  }, [totalXp]);

  const streak = useMemo(() => {
    let count = 0;
    const maxDays = 3650;
    let cursor = new Date(today);
    const todayDone =
      storageMap[dailyKey("mobility", dateKey)] === "1" ||
      storageMap[dailyKey("skip", dateKey)] === "1";
    if (!todayDone) cursor.setDate(cursor.getDate() - 1);

    for (let i = 0; i < maxDays; i += 1) {
      const key = formatLocalDate(cursor);
      const done =
        storageMap[dailyKey("mobility", key)] === "1" ||
        storageMap[dailyKey("skip", key)] === "1";
      if (done) count += 1;
      else break;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [storageMap]);

  const xpProgress = useRef(new Animated.Value(0)).current;
  const lastXpProgress = useRef(null);

  useEffect(() => {
    lastXpProgress.current = levelInfo.progress;
    Animated.timing(xpProgress, {
      toValue: levelInfo.progress,
      duration: 900,
      easing: Easing.bezier(0.3, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [levelInfo.progress, xpProgress]);

  const skipInfo = useMemo(() => {
    const weekStart = getWeekStart(today);
    let tokenUsedDate = null;
    for (let i = 0; i < 7; i += 1) {
      const key = addDays(weekStart, i);
      if (storageMap[dailyKey("skip", key)] === "1") {
        tokenUsedDate = key;
        break;
      }
    }
    if (minimumDone) {
      return { active: false, disabled: true, label: "Locked" };
    }
    if (tokenUsedDate && tokenUsedDate !== dateKey) {
      return { active: false, disabled: true, label: "Used" };
    }
    return { active: isChecked("skip"), disabled: false, label: "1 / week" };
  }, [storageMap, minimumDone, today, dateKey, dailyKey]);

  const rewardItems = new Set(["mobility", "flex", "arc", "pe", "support", "shoulder"]);

  const handleToggle = async (item) => {
    if (item === "skip" && skipInfo.disabled) return;
    const next = !isChecked(item);
    await setChecked(item, next);
    if (next && rewardItems.has(item)) {
      Vibration.vibrate([0, 40, 80, 70]);
      await recordCompletionTime();
    }
    if (next && rewardItems.has(item)) {
      playSound("complete");
    }
  };

  const handleRecovery = async () => {
    const next = !isChecked("recovery");
    if (next) Vibration.vibrate(5);
    await setChecked("recovery", next);
    if (next) {
      for (const item of ["arc", "pe", "support", "shoulder", "flex"]) {
        await setChecked(item, false);
      }
    }
  };

  const handleTimerToggle = () => {
    if (timerRunning) stopTimer();
    else startTimer();
  };

  const handleNoteToggle = async (group, item) => {
    const next = !isNoteChecked(group, item);
    if (group === "limiters" && item === "none" && next) {
      for (const opt of noteLimiters) {
        await setNoteChecked(group, opt.id, opt.id === "none");
      }
      return;
    }
    if (group === "limiters" && item !== "none" && next) {
      await setNoteChecked(group, "none", false);
    }
    if (group === "feel" && next) {
      for (const opt of noteFeels) {
        await setNoteChecked(group, opt.id, opt.id === item);
      }
      return;
    }
    await setNoteChecked(group, item, next);
  };

  const handleBodyCheck = async (id) => {
    await setStored(bodyCheckKey(), id);
    setBodyCheckManualOpen(false);
    setBodyCheckExpanded(false);
  };

  const toggleMaintenance = async () => {
    const next = maintenanceMode ? "0" : "1";
    await setStored(maintenanceKey, next);
    if (next === "1") {
      await setChecked("pe", false);
    }
  };

  const showMaintenanceInfo = () => {
    Alert.alert(
      "Maintenance Mode",
      "Keeps the habit alive with lower load:\n• Mobility → Essential 5 (~10 min)\n• ARC → 1x/week\n• No power-endurance"
    );
  };

  const showRecoveryInfo = () => {
    Alert.alert(
      "Recovery",
      "Marks today as recovery. Bonus sessions are paused."
    );
  };

  const showGraceInfo = () => {
    Alert.alert(
      "Grace",
      "Use once per week to protect your streak when you need a pass."
    );
  };

  const showTimerModeInfo = () => {
    Alert.alert(
      "Timer modes",
      "Free: 1-minute tone.\nIntervals: 10s / 30s / 60s tones.\nSilent: haptic ticks at 10s / 30s / 60s."
    );
  };

  const acceptCommitment = async () => {
    if (commitText !== "I commit") return;
    Vibration.vibrate(1000);
    Animated.parallel([
      Animated.timing(commitFade, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(commitScale, {
        toValue: 0.98,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(async () => {
      await setStored(commitmentKey, "1");
      setShowCommitment(false);
      setCommitText("");
    });
  };

  const closeApp = () => {
    if (Platform.OS === "android") {
      BackHandler.exitApp();
      return;
    }
    Alert.alert("Close app", "Please close the app to continue.");
  };

  const resetToday = async () => {
    for (const item of ["mobility", "flex", "arc", "pe", "support", "shoulder"]) {
      await setChecked(item, false);
    }
    await setChecked("recovery", false);
    await setChecked("skip", false);
    await removeStored(bodyCheckKey());
    setBodyCheckManualOpen(false);
    setBodyCheckExpanded(true);
    for (const opt of noteLimiters) {
      await setNoteChecked("limiters", opt.id, false);
    }
    for (const opt of noteFeels) {
      await setNoteChecked("feel", opt.id, false);
    }
    await AsyncStorage.setItem(xpKey(), "0");
    setStorageMap((prev) => ({ ...prev, [xpKey()]: "0" }));
    resetTimer();
  };

  const clearAll = () => {
    Alert.alert("Clear all history?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          const keys = Object.keys(storageMap).filter((k) =>
            k.startsWith("climb-routine:")
          );
          await AsyncStorage.multiRemove(keys);
          setStorageMap((prev) => {
            const next = { ...prev };
            keys.forEach((k) => delete next[k]);
            return next;
          });
          resetTimer();
        },
      },
    ]);
  };

  const last7Sessions = useMemo(() => {
    const dates = new Set();
    Object.entries(storageMap).forEach(([key, value]) => {
      if (value !== "1") return;
      if (!key.startsWith("climb-routine:note:")) return;
      const parts = key.split(":");
      const date = parts[4];
      if (date) dates.add(date);
    });
    return Array.from(dates)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 7);
  }, [storageMap]);

  const noteSummary = useMemo(() => {
    const countFor = (group, id) =>
      last7Sessions.reduce(
        (sum, day) => sum + (storageMap[noteKey(group, id, day)] === "1" ? 1 : 0),
        0
      );
    const timelineFor = (group, id) =>
      last7Sessions
        .slice()
        .reverse()
        .map((day) => storageMap[noteKey(group, id, day)] === "1");
    return {
      limiters: noteLimiters.map((opt) => ({
        ...opt,
        count: countFor("limiters", opt.id),
        timeline: timelineFor("limiters", opt.id),
      })),
      feels: noteFeels.map((opt) => ({
        ...opt,
        count: countFor("feel", opt.id),
        timeline: timelineFor("feel", opt.id),
      })),
    };
  }, [storageMap, last7Sessions]);

  const steerStyleFor = (tags) => {
    if (!tags.some((tag) => bodySteer.has(tag))) return null;
    const strong = tags.includes("crimp") && bodySteer.has("crimp");
    return strong ? styles.steerMutedStrong : styles.steerMuted;
  };

  const SectionCard = ({ children, onLayout, style }) => (
    <View onLayout={onLayout} style={[styles.card, style]}>
      {children}
    </View>
  );

  const PillButton = ({ children, active, disabled, onPress, onLongPress, muted }) => {
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
      if (active) {
        const anim = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, {
              toValue: 1.3,
              duration: 4000,
              useNativeDriver: true,
            }),
            Animated.timing(pulse, {
              toValue: 1,
              duration: 4000,
              useNativeDriver: true,
            }),
          ])
        );
        anim.start();
        return () => anim.stop();
      }
      Animated.timing(pulse, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }).start();
    }, [active, pulse]);

    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.pill,
          active && styles.pillActive,
          muted && styles.pillMuted,
          disabled && styles.pillDisabled,
          pressed && !disabled && styles.pillPressed,
        ]}
      >
        <Animated.View
          style={[
            styles.pillDot,
            active && styles.pillDotActive,
            { transform: [{ scale: pulse }] },
          ]}
        />
        <Text style={[styles.pillText, muted && styles.pillTextMuted]}>{children}</Text>
      </Pressable>
    );
  };

  const CheckboxRow = ({ label, checked, disabled, onToggle, compact }) => (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={({ pressed }) => [
        styles.checkRow,
        compact && styles.checkRowCompact,
        pressed && !disabled && styles.checkRowPressed,
        disabled && styles.checkRowDisabled,
      ]}
    >
      <View
        style={[
          styles.checkbox,
          compact && styles.checkboxCompact,
          checked && styles.checkboxChecked,
        ]}
      >
        {checked ? (
          <Text style={[styles.checkboxMark, compact && styles.checkboxMarkCompact]}>
            ✓
          </Text>
        ) : null}
      </View>
      <Text style={[styles.checkLabel, compact && styles.checkLabelCompact]}>
        {label}
      </Text>
    </Pressable>
  );

  const RadioRow = ({ label, checked, disabled, onToggle }) => (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={({ pressed }) => [
        styles.checkRow,
        pressed && !disabled && styles.checkRowPressed,
        disabled && styles.checkRowDisabled,
      ]}
    >
      <View style={[styles.radioOuter, checked && styles.radioOuterActive]}>
        {checked ? <View style={styles.radioInner} /> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pager}
        ref={pagerRef}
      >
        <View style={[styles.page, { width }]}>
          <ScrollView contentContainerStyle={styles.container} nestedScrollEnabled>
        <View style={styles.header}>
          <View style={styles.quoteCard}>
            <Text style={styles.quote}>{quote.text}</Text>
            {quote.author ? (
              <Text style={styles.quoteAuthor}>— {quote.author}</Text>
            ) : null}
          </View>
          <View style={styles.headerRow}>
            <View style={styles.todayPill}>
              <Text style={styles.todayText}>{dateText}</Text>
            </View>
            <Pressable
              onPress={toggleMaintenance}
              onLongPress={showMaintenanceInfo}
              style={({ pressed }) => [
                styles.maintenanceToggle,
                maintenanceMode && styles.maintenanceToggleActive,
                pressed && styles.maintenanceTogglePressed,
              ]}
            >
              <Text
                style={[
                  styles.maintenanceText,
                  maintenanceMode && styles.maintenanceTextActive,
                ]}
              >
                Maintenance
              </Text>
              <Animated.View
                style={[
                  styles.maintenanceDot,
                  maintenanceMode && styles.maintenanceDotActive,
                  maintenanceMode && {
                    opacity: maintenancePulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.35, 0.85],
                    }),
                    transform: [
                      {
                        scale: maintenancePulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.25],
                        }),
                      },
                    ],
                  },
                ]}
              />
            </Pressable>
          </View>
            </View>

            <SectionCard>
              <Animated.View
                style={[
                  styles.streakCard,
                  {
                    transform: [{ scale: streakScale }],
                    borderColor: streakGlow.interpolate({
                      inputRange: [0, 1],
                      outputRange: [
                        withAlpha(colors.danger, 0.45),
                        withAlpha(colors.danger, 0.9),
                      ],
                    }),
                    backgroundColor: streakGlow.interpolate({
                      inputRange: [0, 1],
                      outputRange: [
                        withAlpha(colors.danger, 0.12),
                        withAlpha(colors.danger, 0.2),
                      ],
                    }),
                  },
                ]}
              >
                <View style={styles.streakHeader}>
                  <View>
                    <Text style={styles.streakLabel}>🔥 Streak · Mobility</Text>
                    <Text style={styles.streakValue}>
                      {streak} day{streak === 1 ? "" : "s"}
                    </Text>
                  </View>
                </View>
              </Animated.View>
              {showStreakNote ? (
                <Text style={styles.streakNote}>
                  Streak tracks body care, not training volume.
                </Text>
              ) : null}
              <View style={styles.pillRowSplit}>
                <PillButton
                  active={skipInfo.active}
                  disabled={skipInfo.disabled}
                  onPress={() => handleToggle("skip")}
                  onLongPress={showGraceInfo}
                  muted
                >
                  ○ Grace {skipInfo.label}
                </PillButton>
                <PillButton
                  active={recoveryActive}
                  onPress={handleRecovery}
                  onLongPress={showRecoveryInfo}
                >
                  {recoveryActive ? "Recovering..." : "🌿 Recovery"}
                </PillButton>
              </View>

              <View style={styles.bodyCheck}>
                <View style={styles.bodyCheckHeader}>
                  <Text style={styles.bodyCheckTitle}>Body check (today)</Text>
                  {bodyCheckValue && !bodyCheckExpanded ? (
                    <Pressable
                      onPress={() => {
                        setBodyCheckManualOpen(true);
                        setBodyCheckExpanded(true);
                      }}
                    >
                      <Text style={styles.bodyCheckChange}>Change</Text>
                    </Pressable>
                  ) : null}
                </View>
                {bodyCheckValue && !bodyCheckExpanded ? (
                  <Text style={styles.bodyCheckSelected}>{bodyCheckLabel}</Text>
                ) : (
                  <View style={styles.bodyCheckGroup}>
                    {bodyChecks.map((opt) => (
                      <RadioRow
                        key={opt.id}
                        label={opt.label}
                        checked={bodyCheckValue === opt.id}
                        onToggle={() => handleBodyCheck(opt.id)}
                      />
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.sectionDivider} />

              <View style={styles.systemGrid}>
                <View style={styles.systemBlock}>
                  <View style={styles.systemHeader}>
                    <View style={[styles.chip, styles.chipBonus, styles.systemBonusChip]}>
                      <Text style={styles.chipText}>⚡ Bonus · ARC · Power · Core · Shoulder</Text>
                      <View style={styles.bonusValue}>
                        <Text style={styles.bonusValueText}>
                          {recoveryActive ? "Paused" : `${bonusDone}`}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.progress}>
                    <Animated.View
                      style={[
                        styles.progressFill,
                        {
                          width: xpProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ["0%", "100%"],
                          }),
                        },
                      ]}
                    />
                    <Animated.Text
                      style={[
                        styles.progressLabel,
                        {
                          color: xpProgress.interpolate({
                            inputRange: [0, 0.7, 1],
                            outputRange: [colors.ink, colors.ink, colors.bg],
                          }),
                        },
                      ]}
                    >
                      {levelInfo.label}
                    </Animated.Text>
                  </View>
                </View>
                <View style={styles.systemBlock}>
                  <Text style={styles.systemTitle}>Weekly Constraint</Text>
                  <Text style={styles.challengeText}>{weeklyChallenge}</Text>
                </View>
              </View>
            </SectionCard>

            <Text style={styles.footer}>Boring works. Show up.</Text>
          </ScrollView>
          <Animated.View style={[styles.timerBar, { opacity: timerFade }]}>
            <Pressable
              onPress={registerTimerActivity}
              onPressIn={registerTimerActivity}
              style={styles.timerBarPress}
            >
              <Text style={styles.timerBarLabel}>Session timer</Text>
              <View style={styles.timerBarInner}>
                <Pressable
                  onPress={resetTimer}
                  style={({ pressed }) => {
                    registerTimerActivity();
                    return [styles.timerBarBtn, pressed && styles.timerBtnPressed];
                  }}
                >
                  <Text style={styles.timerBarBtnText}>Reset</Text>
                </Pressable>
                <Animated.View
                  style={[
                    styles.timerDisplay,
                    timerRunning && styles.timerDisplayActive,
                    timerRunning && styles.timerDisplayRunning,
                    { transform: [{ scale: timerResetScale }] },
                  ]}
                >
                  <Text style={styles.timerDisplayText}>{formatTime(timerElapsed)}</Text>
                </Animated.View>
                <Pressable
                  onPress={handleTimerToggle}
                  style={({ pressed }) => {
                    registerTimerActivity();
                    return [
                      styles.timerBtn,
                      pressed && styles.timerBtnPressed,
                      timerRunning && styles.timerBtnActive,
                    ];
                  }}
                >
                  <Text style={styles.timerBtnText}>
                    {timerRunning ? "Pause" : "Go"}
                  </Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => {
                  registerTimerActivity();
                  cycleTimerMode();
                }}
                onLongPress={showTimerModeInfo}
                style={({ pressed }) => [
                  styles.timerModeBtn,
                  pressed && styles.timerBtnPressed,
                ]}
              >
                <Text style={styles.timerModeBtnText}>Mode · {timerModeLabel}</Text>
              </Pressable>
            </Pressable>
          </Animated.View>
        </View>

        <View style={[styles.page, { width }]}>
          <ScrollView
            contentContainerStyle={styles.container}
            nestedScrollEnabled
            ref={exercisesScrollRef}
          >
            <View style={styles.headerTight}>
              <Text style={styles.headerTitle}>Exercises</Text>
            </View>

        <SectionCard
          onLayout={(e) => {
            exerciseLayoutRef.current.mobility = e.nativeEvent.layout.y;
          }}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.tag}>
                {maintenanceMode ? "Daily · Essential 5 · 10 min" : "Daily · 20–25 min"}
              </Text>
              <Text style={styles.cardTitle}>Daily Mobility (Non-Negotiable)</Text>
            </View>
            <CheckboxRow
              compact
              label="Completed"
              checked={isChecked("mobility")}
              onToggle={() => handleToggle("mobility")}
            />
          </View>
          {!isChecked("mobility") && (
            <View style={styles.cardBody}>
              {maintenanceMode ? (
                <>
                  <Text style={styles.paragraph}>
                    Essential 5. Keep it easy. Slow nasal breathing.
                  </Text>
                  <Text style={styles.listItem}>• Hips — deep squat hold 2 min total</Text>
                  <Text style={styles.listItem}>• Spine — cat–cow 1×8</Text>
                  <Text style={styles.listItem}>• Shoulders — external rotation stretch 2×30s</Text>
                  <Text style={styles.listItem}>• Ankles — knee-to-wall 2×8/side</Text>
                  <Text style={styles.listItem}>• Breath — 1 min nasal</Text>
                </>
              ) : (
                <>
                  <Text style={styles.paragraph}>
                    Open hips, shoulders, spine, and ankles. Breathe slow and nasal.
                  </Text>
                  <Text style={styles.listItem}>
                    • Hips{"\n"}
                    {"  "}– Deep squat hold: 2–3 min total{"\n"}
                    {"  "}– Frog stretch: 2×60–90s{"\n"}
                    {"  "}– Cossack squats: 2×8/side
                  </Text>
                  <Text style={styles.listItem}>
                    • Spine{"\n"}
                    {"  "}– Thoracic rotations: 2×10/side{"\n"}
                    {"  "}– Cat–cow: 2×8
                  </Text>
                  <Text style={styles.listItem}>
                    • Shoulders{"\n"}
                    {"  "}– Internal + external rotation stretch: 2×45s{"\n"}
                    {"  "}– Overhead flexion stretch: 2×45s
                  </Text>
                  <Text style={styles.listItem}>
                    • Ankles{"\n"}
                    {"  "}– Knee-to-wall dorsiflexion: 2×10/side{"\n"}
                    {"  "}– Calf stretch bent + straight: 2×45s
                  </Text>
                </>
              )}
            </View>
          )}
        </SectionCard>

        <SectionCard
          onLayout={(e) => {
            exerciseLayoutRef.current.flex = e.nativeEvent.layout.y;
          }}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.tag}>3–4x/week</Text>
              <Text style={styles.cardTitle}>Climbing-Specific Flexibility</Text>
            </View>
            <CheckboxRow
              compact
              label="Completed"
              checked={isChecked("flex")}
              disabled={recoveryActive}
              onToggle={() => handleToggle("flex")}
            />
          </View>
          {!isChecked("flex") && (
            <View style={styles.cardBody}>
              <Text style={styles.listItem}>
                • High-step holds on the wall — 3×20–30s/side{"\n"}
                {"  "}– At home: foot on chair/bench, slow hip flexion{"\n"}
                {"  "}– Crowded gym: wall-supported knee raises
              </Text>
              <Text style={styles.listItem}>• Drop-knee stretch — 3×20–30s/side</Text>
              <Text style={styles.listItem}>• Lock-off shoulder stretch — 2×30s/side</Text>
            </View>
          )}
        </SectionCard>

        <SectionCard
          onLayout={(e) => {
            exerciseLayoutRef.current.arc = e.nativeEvent.layout.y;
          }}
          style={steerStyleFor(["pull"])}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.tag}>{maintenanceMode ? "1x/week" : "2–3x/week"}</Text>
              <Text style={styles.cardTitle}>Endurance Base (ARC)</Text>
            </View>
            <CheckboxRow
              compact
              label="Completed"
              checked={isChecked("arc")}
              disabled={recoveryActive}
              onToggle={() => handleToggle("arc")}
            />
          </View>
          {!isChecked("arc") && (
            <View style={styles.cardBody}>
              <Text style={styles.paragraph}>Easy intensity; you can hold a conversation. Focus on footwork and a relaxed grip.</Text>
              <Text style={styles.listItem}>• 25–45 minutes continuous movement</Text>
              <Text style={styles.listItem}>• If forearms burn, lower the intensity</Text>
            </View>
          )}
        </SectionCard>

        <SectionCard
          onLayout={(e) => {
            exerciseLayoutRef.current.pe = e.nativeEvent.layout.y;
          }}
          style={steerStyleFor(["pull", "shoulder"])}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.tag}>2x/week max</Text>
              <Text style={styles.cardTitle}>Power-Endurance (Anaerobic Capacity)</Text>
            </View>
            <CheckboxRow
              compact
              label="Completed"
              checked={isChecked("pe")}
              disabled={recoveryActive || maintenanceMode}
              onToggle={() => handleToggle("pe")}
            />
          </View>
          {!isChecked("pe") && (
            <View style={styles.cardBody}>
              {maintenanceMode ? (
                <Text style={styles.subtleNote}>Maintenance mode: skip power-endurance.</Text>
              ) : null}
              <Text style={styles.listItem}>
                • 4×4s{"\n"}
                {"  "}– 4 boulders @ ~80%{"\n"}
                {"  "}– Climb back-to-back{"\n"}
                {"  "}– Rest 2–3 min{"\n"}
                {"  "}– Repeat 4 rounds
              </Text>
              <Text style={styles.listItem}>
                • Linked routes{"\n"}
                {"  "}– 2 medium routes with no rest{"\n"}
                {"  "}– Rest 3 min{"\n"}
                {"  "}– 4–6 sets
              </Text>
            </View>
          )}
        </SectionCard>

        <SectionCard
          onLayout={(e) => {
            exerciseLayoutRef.current.shoulder = e.nativeEvent.layout.y;
          }}
          style={steerStyleFor(["shoulder"])}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.tag}>1–2x/week</Text>
              <Text style={styles.cardTitle}>Shoulder Support</Text>
            </View>
            <CheckboxRow
              compact
              label="Completed"
              checked={isChecked("shoulder")}
              disabled={recoveryActive}
              onToggle={() => handleToggle("shoulder")}
            />
          </View>
          {!isChecked("shoulder") && (
            <View style={styles.cardBody}>
              <Text style={styles.listItem}>• Side-lying external rotation — 2×12</Text>
              <Text style={styles.listItem}>• Band pull-aparts — 2×15</Text>
            </View>
          )}
        </SectionCard>

        <SectionCard
          onLayout={(e) => {
            exerciseLayoutRef.current.support = e.nativeEvent.layout.y;
          }}
          style={steerStyleFor(["crimp"])}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.tag}>1–2x/week</Text>
              <Text style={styles.cardTitle}>Forearm & Core Support (No Gear)</Text>
            </View>
            <CheckboxRow
              compact
              label="Completed"
              checked={isChecked("support")}
              disabled={recoveryActive}
              onToggle={() => handleToggle("support")}
            />
          </View>
          {!isChecked("support") && (
            <View style={styles.cardBody}>
              <Text style={styles.listItem}>
                • Forearms{"\n"}
                {"  "}– Towel or edge hangs: 6–10s on / 6–10s off ×6–8{"\n"}
                {"  "}– Wrist flexion/extension: 2×15{"\n"}
                {"  "}– If skin is thin or tender, skip today.
              </Text>
              <Text style={styles.listItem}>
                • Core{"\n"}
                {"  "}– Hollow body: 3×30–45s{"\n"}
                {"  "}– Side plank with leg raise: 2×20–30s{"\n"}
                {"  "}– Dead bugs: 2×10/side
              </Text>
            </View>
          )}
        </SectionCard>

        <SectionCard>
          <Text style={styles.tag}>Weekly structure</Text>
          <Text style={styles.cardTitle}>Weekly Structure</Text>
          <Text style={styles.listItem}>
            • Daily: {maintenanceMode ? "mobility (Essential 5)" : "mobility"}
          </Text>
          <Text style={styles.listItem}>
            • {maintenanceMode ? "1x/week" : "2–3x/week"}: ARC endurance
          </Text>
          <Text style={styles.listItem}>
            • {maintenanceMode ? "0x/week" : "2x/week"}: power-endurance
          </Text>
          <Text style={styles.listItem}>• 1–2x/week: shoulder support</Text>
          <Text style={styles.listItem}>• 1–2x/week: forearm + core</Text>
          <Text style={styles.listItem}>• 1 full rest day or active recovery only</Text>
          <Text style={styles.notice}>Flexibility comes from consistency. Endurance comes from staying relaxed under load.</Text>
        </SectionCard>

        <View style={styles.buttonRow}>
          <Pressable onPress={resetToday} style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}>
            <Text style={styles.actionBtnText}>Reset today</Text>
          </Pressable>
          <Pressable onPress={clearAll} style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}>
            <Text style={styles.actionBtnText}>Clear all history</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>Boring works. Show up.</Text>
          </ScrollView>
        </View>

        <View style={[styles.page, { width }]}>
          <ScrollView contentContainerStyle={styles.container} nestedScrollEnabled>
            <View style={styles.headerTight}>
              <Text style={styles.headerTitle}>Session Notes (Optional)</Text>
            </View>

            <SectionCard>
              <Text style={styles.cardTitle}>What limited today’s session?</Text>
              <View style={styles.cardBody}>
                {noteLimiters.map((opt) => (
                  <CheckboxRow
                    key={opt.id}
                    label={opt.label}
                    checked={isNoteChecked("limiters", opt.id)}
                    onToggle={() => handleNoteToggle("limiters", opt.id)}
                  />
                ))}
              </View>
            </SectionCard>

            <SectionCard>
              <Text style={styles.cardTitle}>How did it feel overall?</Text>
              <View style={styles.cardBodySoft}>
                {noteFeels.map((opt) => (
                  <RadioRow
                    key={opt.id}
                    label={opt.label}
                    checked={isNoteChecked("feel", opt.id)}
                    onToggle={() => handleNoteToggle("feel", opt.id)}
                  />
                ))}
              </View>
            </SectionCard>

            <SectionCard>
              <Text style={styles.cardTitle}>Last 7 sessions</Text>
              <Text style={styles.summaryLabel}>Limiters</Text>
              {noteSummary.limiters
                .filter((opt) => opt.count > 0)
                .sort((a, b) => b.count - a.count)
                .map((opt) => (
                  <View key={opt.id} style={styles.summaryRow}>
                    <Text style={[styles.listItem, styles.summaryItemLabel]}>
                      • {opt.label}
                    </Text>
                    <View style={styles.summaryDots}>
                      {opt.timeline.map((hit, idx) => (
                        <View
                          key={`${opt.id}-${idx}`}
                          style={[
                            styles.summaryDot,
                            hit && styles.summaryDotActive,
                            idx === opt.timeline.length - 1 && styles.summaryDotRecent,
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              <Text style={styles.summaryLabel}>Overall feel</Text>
              {noteSummary.feels
                .filter((opt) => opt.count > 0)
                .sort((a, b) => b.count - a.count)
                .map((opt) => (
                  <View key={opt.id} style={styles.summaryRow}>
                    <Text style={[styles.listItem, styles.summaryItemLabel]}>
                      • {opt.label}
                    </Text>
                    <View style={styles.summaryDots}>
                      {opt.timeline.map((hit, idx) => (
                        <View
                          key={`${opt.id}-${idx}`}
                          style={[
                            styles.summaryDot,
                            hit && styles.summaryDotActive,
                            idx === opt.timeline.length - 1 && styles.summaryDotRecent,
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              {noteSummary.limiters.every((opt) => opt.count === 0) &&
              noteSummary.feels.every((opt) => opt.count === 0) ? (
                <Text style={styles.paragraph}>No notes recorded in the last 7 sessions.</Text>
              ) : (
                <Text style={styles.summaryNote}>Based on your last 7 sessions.</Text>
              )}
            </SectionCard>

            <Text style={styles.footer}>Boring works. Show up.</Text>
          </ScrollView>
        </View>
      </ScrollView>
      {showCommitment && (
        <Animated.View style={[styles.commitOverlay, { opacity: commitFade }]}>
          <Animated.View style={[styles.commitCard, { transform: [{ scale: commitScale }] }]}>
            <Text style={styles.commitTitle}>This app only works if you use it.</Text>
            <Text style={styles.commitBody}>
              We didn't build this to sit on your phone.
              {"\n"}
              We built it to help you show up, even when you don't feel like it.
              {"\n"}
              If you're in, commit.
            </Text>
            <TextInput
              value={commitText}
              onChangeText={setCommitText}
              placeholder="Type I commit"
              placeholderTextColor={withAlpha(colors.muted, 0.6)}
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
              style={styles.commitInput}
              selectionColor={colors.accent}
              returnKeyType="done"
              onSubmitEditing={acceptCommitment}
            />
            <Pressable
              onPress={acceptCommitment}
              disabled={!commitReady}
              style={({ pressed }) => [
                styles.commitButton,
                !commitReady && styles.commitButtonDisabled,
                pressed && commitReady && styles.commitButtonPressed,
              ]}
            >
              <Text style={styles.commitButtonText}>Commit</Text>
            </Pressable>
            <Pressable onPress={closeApp}>
              <Text style={styles.commitClose}>Close app</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const createStyles = (colors, isDark) =>
  StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  pager: {
    alignItems: "stretch",
  },
  page: {
    flex: 1,
  },
  container: {
    padding: 20,
    paddingBottom: 120,
  },
  header: {
    paddingTop: 14,
    paddingBottom: 12,
  },
  quoteCard: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card2,
    marginBottom: 16,
  },
  quote: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
  },
  quoteAuthor: {
    color: colors.muted,
    marginTop: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  todayPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card2,
  },
  todayText: {
    color: withAlpha(colors.muted, 0.8),
    fontSize: 12,
    letterSpacing: 0.3,
  },
  maintenanceToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: withAlpha(colors.line, 0.7),
    backgroundColor: colors.card2,
  },
  maintenanceToggleActive: {
    borderColor: withAlpha(colors.muted, 0.5),
    backgroundColor: withAlpha(colors.muted, 0.08),
  },
  maintenanceTogglePressed: {
    opacity: 0.85,
  },
  maintenanceText: {
    color: withAlpha(colors.muted, 0.8),
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  maintenanceTextActive: {
    color: withAlpha(colors.muted, 0.95),
  },
  maintenanceDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: withAlpha(colors.muted, 0.35),
  },
  maintenanceDotActive: {
    backgroundColor: withAlpha(colors.muted, 0.7),
  },
  commitOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: withAlpha(colors.bg, isDark ? 0.82 : 0.72),
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  commitCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 18,
  },
  commitTitle: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 10,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
  },
  commitBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  commitInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.ink,
    backgroundColor: colors.card2,
    marginBottom: 12,
  },
  commitButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: withAlpha(colors.muted, 0.4),
    backgroundColor: withAlpha(colors.muted, 0.12),
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  commitButtonDisabled: {
    opacity: 0.5,
  },
  commitButtonPressed: {
    opacity: 0.8,
  },
  commitButtonText: {
    color: colors.ink,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontSize: 12,
  },
  commitClose: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
  },
  headerTight: {
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerTitle: {
    color: colors.ink,
    fontSize: 22,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    marginBottom: 4,
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  tag: {
    color: withAlpha(colors.muted, 0.8),
    fontSize: 11,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 18,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    marginBottom: 8,
    width: "100%",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  cardHeaderLeft: {
    flex: 1,
    paddingRight: 6,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 6,
    marginBottom: 6,
  },
  summaryNote: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
  },
  summaryRow: {
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  summaryDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 12,
  },
  summaryItemLabel: {
    flexShrink: 1,
    paddingRight: 8,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.line,
  },
  summaryDotActive: {
    backgroundColor: withAlpha(colors.accent2, 0.7),
  },
  summaryDotRecent: {
    borderWidth: 1,
    borderColor: withAlpha(colors.muted, 0.5),
  },
  cardBody: {
    marginBottom: 10,
  },
  cardBodySoft: {
    marginBottom: 6,
    opacity: 0.9,
  },
  paragraph: {
    color: colors.muted,
    marginBottom: 8,
  },
  listItem: {
    color: colors.ink,
    marginBottom: 6,
    lineHeight: 20,
  },
  notice: {
    marginTop: 8,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
    color: colors.muted,
  },
  subtleNote: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 6,
  },
  timerBtn: {
    minWidth: 54,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card2,
    alignItems: "center",
    justifyContent: "center",
  },
  timerBtnActive: {
    borderColor: withAlpha(colors.accent, 0.6),
    backgroundColor: withAlpha(colors.accent, 0.18),
  },
  timerBtnPressed: {
    opacity: 0.85,
  },
  timerBtnText: {
    color: colors.ink,
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  timerDisplay: {
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card2,
  },
  timerDisplayActive: {
    borderColor: withAlpha(colors.accent, 0.45),
    backgroundColor: withAlpha(colors.accent, 0.12),
  },
  timerDisplayRunning: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  timerDisplayText: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 14,
  },
  timerBar: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 16,
    zIndex: 20,
    elevation: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card2,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  timerBarPress: {
    width: "100%",
  },
  timerBarLabel: {
    color: withAlpha(colors.muted, 0.7),
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
    textAlign: "center",
  },
  timerModeBtn: {
    alignSelf: "center",
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: withAlpha(colors.line, 0.6),
  },
  timerModeBtnText: {
    color: withAlpha(colors.muted, 0.75),
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  timerBarInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  timerBarBtn: {
    minWidth: 60,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card2,
    alignItems: "center",
    justifyContent: "center",
  },
  timerBarBtnText: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card2,
  },
  chipText: {
    color: colors.muted,
    fontSize: 12,
  },
  chipMin: {
    borderColor: withAlpha(colors.accent, 0.4),
  },
  chipBonus: {
    borderColor: withAlpha(colors.accent2, 0.4),
  },
  chipLock: {
    borderColor: withAlpha(colors.danger, 0.4),
  },
  streakCard: {
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: withAlpha(colors.danger, 0.45),
    backgroundColor: withAlpha(colors.danger, 0.12),
  },
  streakHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  streakLabel: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  streakValue: {
    color: colors.ink,
    fontSize: 22,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
  },
  streakNote: {
    marginBottom: 10,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  bodyCheck: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card2,
  },
  bodyCheckHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  bodyCheckTitle: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  bodyCheckChange: {
    color: colors.muted,
    fontSize: 12,
    textDecorationLine: "underline",
    textDecorationStyle: "solid",
  },
  bodyCheckSelected: {
    color: colors.ink,
    fontSize: 14,
    marginTop: 2,
  },
  bodyCheckGroup: {
    gap: 6,
    marginTop: 2,
  },
  steerMuted: {
    opacity: 0.55,
  },
  steerMutedStrong: {
    opacity: 0.4,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  pillRowSplit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card2,
  },
  pillActive: {
    borderColor: withAlpha(colors.accent2, 0.6),
    backgroundColor: withAlpha(colors.accent2, 0.14),
  },
  pillMuted: {
    borderColor: withAlpha(colors.line, 0.6),
    backgroundColor: colors.card2,
  },
  pillDisabled: {
    opacity: 0.5,
  },
  pillPressed: {
    opacity: 0.85,
  },
  pillDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.line,
  },
  pillDotActive: {
    backgroundColor: colors.accent2,
  },
  pillText: {
    color: colors.ink,
    fontSize: 13,
  },
  pillTextMuted: {
    color: withAlpha(colors.muted, 0.75),
  },
  systemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  systemBlock: {
    flexGrow: 1,
    minWidth: 240,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card2,
  },
  systemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  systemTitle: {
    color: colors.ink,
    fontWeight: "600",
    flexShrink: 1,
  },
  systemBonusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  bonusValue: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: withAlpha(colors.accent2, 0.18),
    borderWidth: 1,
    borderColor: withAlpha(colors.accent2, 0.45),
  },
  bonusValueText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "600",
  },
  challengeText: {
    color: colors.ink,
    marginBottom: 4,
  },
  progress: {
    width: "100%",
    height: 22,
    borderRadius: 999,
    backgroundColor: withAlpha(colors.accent2, 0.12),
    overflow: "hidden",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: withAlpha(colors.accent2, 0.35),
    padding: 2,
  },
  progressFill: {
    position: "absolute",
    left: 2,
    top: 2,
    bottom: 2,
    backgroundColor: isDark ? "#4fa85e" : colors.accent2,
    borderRadius: 999,
  },
  progressLabel: {
    textAlign: "center",
    fontSize: 9,
    fontWeight: "400",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: withAlpha(colors.line, 0.7),
    marginBottom: 12,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card2,
  },
  checkRowCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
  },
  checkRowPressed: {
    opacity: 0.85,
  },
  checkRowDisabled: {
    opacity: 0.5,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  checkboxCompact: {
    width: 16,
    height: 16,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxMark: {
    color: colors.bg,
    fontSize: 12,
    fontWeight: "700",
  },
  checkboxMarkCompact: {
    fontSize: 10,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  radioOuterActive: {
    borderColor: colors.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  checkLabel: {
    color: colors.ink,
    flexShrink: 1,
  },
  checkLabelCompact: {
    fontSize: 11,
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionBtnPressed: {
    opacity: 0.85,
  },
  actionBtnText: {
    color: colors.ink,
  },
  footer: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    marginTop: 20,
  },
});
