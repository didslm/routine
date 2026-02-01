import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  AppState,
  Vibration,
  Easing,
  NativeModules,
  useWindowDimensions,
  useColorScheme,
  Animated,
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
  { text: "Start before you're ready. Readiness is a delay tactic.", author: "" },
  { text: "Ten minutes beats zero. Zero beats nothing except your ego.", author: "" },
  { text: "The session that feels pointless is the one that counts.", author: "" },
  { text: "You don't rise to motivation. You sink to your systems.", author: "" },
  { text: "Miss intensity, not days.", author: "" },
  { text: "Consistency is boredom executed well.", author: "" },
  { text: "The urge to skip is the signal.", author: "" },
  { text: "If it feels optional, it isn't.", author: "" },
  { text: "Discomfort is the entry fee, not the goal.", author: "" },
  { text: "I train because this is what climbers do.", author: "" },
  { text: "This is maintenance, not self-improvement.", author: "" },
  { text: "I don't negotiate with the version of me that wants comfort.", author: "" },
  { text: "Future strength is built on unremarkable days.", author: "" },
  { text: "Nothing dramatic happens today. That's the point.", author: "" },
  { text: "The body remembers what the mind avoids.", author: "" },
  { text: "Start small. Start now. Adjust later.", author: "" },
  { text: "Do the minimum. Let momentum handle the rest.", author: "" },
  { text: "One rep is infinitely more than thinking about reps.", author: "" },
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

const pickQuote = (dayKey) => {
  let seed = 0;
  for (let i = 0; i < dayKey.length; i += 1) seed += dayKey.charCodeAt(i);
  return quotes[seed % quotes.length];
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
  const quote = useMemo(() => pickQuote(dateKey), [dateKey]);
  const [storageMap, setStorageMap] = useState({});
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
  const doneAtKey = useCallback(
    (day = dateKey) => `climb-routine:doneAt:${day}`,
    [dateKey]
  );
  const noteKey = useCallback(
    (group, item, day = dateKey) => `climb-routine:note:${group}:${item}:${day}`,
    [dateKey]
  );

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
  const lastStreak = useRef(null);

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
      if (mounted) setStorageMap(map);
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

  const setStored = async (key, value) => {
    await AsyncStorage.setItem(key, value);
    setStorageMap((prev) => ({ ...prev, [key]: value }));
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
  const bonusDone = ["arc", "pe", "support"].filter((item) => isChecked(item)).length;

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
      storageMap[dailyKey("recovery", dateKey)] === "1" ||
      storageMap[dailyKey("skip", dateKey)] === "1";
    if (!todayDone) cursor.setDate(cursor.getDate() - 1);

    for (let i = 0; i < maxDays; i += 1) {
      const key = formatLocalDate(cursor);
      const done =
        storageMap[dailyKey("mobility", key)] === "1" ||
        storageMap[dailyKey("recovery", key)] === "1" ||
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
    if (lastXpProgress.current !== null && levelInfo.progress > lastXpProgress.current) {
      Vibration.vibrate(5);
    }
    lastXpProgress.current = levelInfo.progress;
    Animated.timing(xpProgress, {
      toValue: levelInfo.progress,
      duration: 900,
      easing: Easing.bezier(0.3, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [levelInfo.progress, xpProgress]);

  useEffect(() => {
    if (lastStreak.current === null) {
      lastStreak.current = streak;
      return;
    }
    if (streak === lastStreak.current) return;
    lastStreak.current = streak;
    Vibration.vibrate([0, 10, 60, 10, 60, 30]);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(streakScale, {
          toValue: 1.06,
          duration: 140,
          useNativeDriver: false,
        }),
        Animated.spring(streakScale, {
          toValue: 1,
          friction: 5,
          useNativeDriver: false,
        }),
      ]),
      Animated.sequence([
        Animated.timing(streakGlow, {
          toValue: 1,
          duration: 160,
          useNativeDriver: false,
        }),
        Animated.timing(streakGlow, {
          toValue: 0,
          duration: 280,
          useNativeDriver: false,
        }),
      ]),
    ]).start();
  }, [streak, streakScale, streakGlow]);

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

  const rewardItems = new Set(["mobility", "flex", "arc", "pe", "support"]);

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
      for (const item of ["arc", "pe", "support", "flex"]) {
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

  const resetToday = async () => {
    for (const item of ["mobility", "flex", "arc", "pe", "support"]) {
      await setChecked(item, false);
    }
    await setChecked("recovery", false);
    await setChecked("skip", false);
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

  const SectionCard = ({ children, onLayout }) => (
    <View onLayout={onLayout} style={styles.card}>
      {children}
    </View>
  );

  const PillButton = ({ children, active, disabled, onPress, muted }) => {
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
      if (active) {
        const anim = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, {
              toValue: 1.3,
              duration: 520,
              useNativeDriver: true,
            }),
            Animated.timing(pulse, {
              toValue: 1,
              duration: 520,
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
          <View style={styles.todayPill}>
            <Text style={styles.todayText}>{dateText}</Text>
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
              <View style={styles.pillRowSplit}>
                <PillButton
                  active={skipInfo.active}
                  disabled={skipInfo.disabled}
                  onPress={() => handleToggle("skip")}
                  muted
                >
                  ○ Grace {skipInfo.label}
                </PillButton>
                <PillButton active={recoveryActive} onPress={handleRecovery}>
                  {recoveryActive ? "Recovering..." : "🌿 Recovery"}
                </PillButton>
              </View>

              <View style={styles.sectionDivider} />

              <View style={styles.systemGrid}>
                <View style={styles.systemBlock}>
                  <View style={styles.systemHeader}>
                    <View style={[styles.chip, styles.chipBonus, styles.systemBonusChip]}>
                      <Text style={styles.chipText}>⚡ Bonus · ARC · Power · Core</Text>
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
              style={({ pressed }) => [
                styles.timerModeBtn,
                pressed && styles.timerBtnPressed,
              ]}
            >
              <Text style={styles.timerModeBtnText}>Mode · {timerModeLabel}</Text>
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
              <Text style={styles.tag}>Daily · 20–25 min</Text>
              <Text style={styles.cardTitle}>1. Daily Mobility (Non-Negotiable)</Text>
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
              <Text style={styles.paragraph}>Open hips, shoulders, spine, and ankles. Breathe slow and nasal.</Text>
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
              <Text style={styles.cardTitle}>2. Climbing-Specific Flexibility</Text>
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
              <Text style={styles.listItem}>• High-step holds on the wall — 3×20–30s/side</Text>
              <Text style={styles.listItem}>• Drop-knee stretch — 3×20–30s/side</Text>
              <Text style={styles.listItem}>• Lock-off shoulder stretch — 2×30s/side</Text>
            </View>
          )}
        </SectionCard>

        <SectionCard
          onLayout={(e) => {
            exerciseLayoutRef.current.arc = e.nativeEvent.layout.y;
          }}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.tag}>2–3x/week</Text>
              <Text style={styles.cardTitle}>3. Endurance Base (ARC)</Text>
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
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.tag}>2x/week max</Text>
              <Text style={styles.cardTitle}>4. Power-Endurance (Pain Zone)</Text>
            </View>
            <CheckboxRow
              compact
              label="Completed"
              checked={isChecked("pe")}
              disabled={recoveryActive}
              onToggle={() => handleToggle("pe")}
            />
          </View>
          {!isChecked("pe") && (
            <View style={styles.cardBody}>
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
            exerciseLayoutRef.current.support = e.nativeEvent.layout.y;
          }}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.tag}>1–2x/week</Text>
              <Text style={styles.cardTitle}>5. Forearm & Core Support (No Gear)</Text>
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
                {"  "}– Wrist flexion/extension: 2×15
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
          <Text style={styles.cardTitle}>6. Weekly Structure</Text>
          <Text style={styles.listItem}>• Daily: mobility</Text>
          <Text style={styles.listItem}>• 2–3x/week: ARC endurance</Text>
          <Text style={styles.listItem}>• 2x/week: power-endurance</Text>
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
    paddingTop: 24,
    paddingBottom: 24,
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
  todayPill: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card2,
  },
  todayText: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 0.3,
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
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  cardHeaderLeft: {
    flexShrink: 1,
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
