import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  useColorScheme,
  Alert,
  Linking,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { StatusBar } from 'expo-status-bar';
import { LIGHT_THEME, DARK_THEME } from './src/theme';
import { INITIAL_PERFUMES, ADMIN_PASSCODE } from './src/data';
import { getSyncConfig, saveSyncConfig, pullSharedState, pushSharedState } from './src/sync';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STORAGE_KEYS = {
  PERFUMES: '@aj_perfumes_v1',
  CART: '@aj_cart_v1',
  ORDERS: '@aj_orders_v1',
  THEME_MODE: '@aj_theme_mode_v1',
};

const sortAZ = (items) =>
  [...items].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'tk', { sensitivity: 'base' })
  );

const effectivePrice = (p) =>
  p.salePrice && Number(p.salePrice) > 0 && Number(p.salePrice) < Number(p.price)
    ? Number(p.salePrice)
    : Number(p.price);

export default function App() {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState('system');
  const activeMode = themeMode === 'system' ? (systemScheme || 'dark') : themeMode;
  const theme = activeMode === 'light' ? LIGHT_THEME : DARK_THEME;

  const [netStatus, setNetStatus] = useState('connecting');
  const [screen, setScreen] = useState('home');
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [passcodeModalVisible, setPasscodeModalVisible] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');

  const [perfumes, setPerfumes] = useState(INITIAL_PERFUMES);
  const [cart, setCart] = useState({});
  const [orders, setOrders] = useState([]);

  // Shared 2-user sync state
  const [syncUrl, setSyncUrl] = useState('');
  const [syncRoom, setSyncRoom] = useState('allanur_jemile_store');
  const [syncStatusText, setSyncStatusText] = useState('Ýerli ýatda (Sazlama gerek)');

  const [zoomedPerfume, setZoomedPerfume] = useState(null);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('+993 ');
  const [customerNote, setCustomerNote] = useState('');

  const [imgUri, setImgUri] = useState('');
  const [imgUrlInput, setImgUrlInput] = useState('');
  const [imgStatus, setImgStatus] = useState('idle');
  const [nameInput, setNameInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [salePriceInput, setSalePriceInput] = useState('');
  const [soldInput, setSoldInput] = useState('0');
  const [volumeInput, setVolumeInput] = useState('100');
  const [longevityInput, setLongevityInput] = useState('12');

  const carouselRef = useRef(null);
  const carouselIndexRef = useRef(0);
  const topSellers = [...perfumes]
    .sort((a, b) => Number(b.soldCount) - Number(a.soldCount))
    .slice(0, 5);

  useEffect(() => {
    initApp();
    const unsubNet = NetInfo.addEventListener((state) => {
      setNetStatus('connecting');
      setTimeout(() => {
        if (state.isConnected && state.isInternetReachable !== false) {
          setNetStatus('online');
        } else {
          setNetStatus('offline');
        }
      }, 450);
    });
    return () => unsubNet();
  }, []);

  // Poll shared cloud every 4 seconds so both users see each other's changes
  useEffect(() => {
    const interval = setInterval(() => {
      syncFromCloud(true);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (screen !== 'home' || topSellers.length <= 1) return;
    const timer = setInterval(() => {
      carouselIndexRef.current = (carouselIndexRef.current + 1) % topSellers.length;
      carouselRef.current?.scrollTo({
        x: carouselIndexRef.current * (SCREEN_WIDTH - 32),
        animated: true,
      });
    }, 3200);
    return () => clearInterval(timer);
  }, [screen, topSellers.length]);

  const initApp = async () => {
    await loadSavedData();
    const cfg = await getSyncConfig();
    setSyncUrl(cfg.baseUrl);
    setSyncRoom(cfg.roomId);
    if (cfg.baseUrl) {
      await syncFromCloud(false);
    }
  };

  const syncFromCloud = async (silent = true) => {
    try {
      const remote = await pullSharedState();
      if (!remote) return;
      if (Array.isArray(remote.perfumes)) {
        const sorted = sortAZ(remote.perfumes);
        setPerfumes(sorted);
        await AsyncStorage.setItem(STORAGE_KEYS.PERFUMES, JSON.stringify(sorted));
      }
      if (Array.isArray(remote.orders)) {
        setOrders(remote.orders);
        await AsyncStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(remote.orders));
      }
      setSyncStatusText('2 adam baglanyşykly (Sinhronlaşdy)');
      if (!silent) {
        Alert.alert('Sinhronlaşdy', 'Beýleki ulanyjynyň goşan maglumatlary ýüklendi.');
      }
    } catch (e) {
      setSyncStatusText('Sinhronlaşdyryp bolmady');
    }
  };

  const handleSaveSyncConfig = async () => {
    const saved = await saveSyncConfig({ baseUrl: syncUrl, roomId: syncRoom });
    setSyncUrl(saved.baseUrl);
    setSyncRoom(saved.roomId);
    if (!saved.baseUrl) {
      setSyncStatusText('Ýerli ýatda (Sazlama gerek)');
      Alert.alert('Ýatda saklandy', 'Baza salgysy boş — diňe şu telefonda saklanýar.');
      return;
    }
    try {
      await pushSharedState({ perfumes, orders });
      await syncFromCloud(false);
    } catch (e) {
      Alert.alert('Ýalňyşlyk', 'Baza salgysyny barlaň.');
    }
  };

  const loadSavedData = async () => {
    try {
      const [pRaw, cRaw, oRaw, tRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.PERFUMES),
        AsyncStorage.getItem(STORAGE_KEYS.CART),
        AsyncStorage.getItem(STORAGE_KEYS.ORDERS),
        AsyncStorage.getItem(STORAGE_KEYS.THEME_MODE),
      ]);
      if (pRaw) setPerfumes(sortAZ(JSON.parse(pRaw)));
      if (cRaw) setCart(JSON.parse(cRaw));
      if (oRaw) setOrders(JSON.parse(oRaw));
      if (tRaw) setThemeMode(tRaw);
    } catch (e) {
      console.log('Load error:', e);
    }
  };

  const savePerfumes = async (list, nextOrdersOverride = null) => {
    const sorted = sortAZ(list);
    setPerfumes(sorted);
    await AsyncStorage.setItem(STORAGE_KEYS.PERFUMES, JSON.stringify(sorted));
    try {
      await pushSharedState({
        perfumes: sorted,
        orders: nextOrdersOverride !== null ? nextOrdersOverride : orders,
      });
    } catch (e) {}
  };

  const saveCart = async (nextCart) => {
    setCart(nextCart);
    await AsyncStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(nextCart));
  };

  const saveOrders = async (nextOrders, nextPerfumesOverride = null) => {
    setOrders(nextOrders);
    await AsyncStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(nextOrders));
    try {
      await pushSharedState({
        perfumes: nextPerfumesOverride !== null ? sortAZ(nextPerfumesOverride) : perfumes,
        orders: nextOrders,
      });
    } catch (e) {}
  };

  const changeThemeMode = async (mode) => {
    setThemeMode(mode);
    await AsyncStorage.setItem(STORAGE_KEYS.THEME_MODE, mode);
  };

  const addToCart = (id) => {
    const next = { ...cart, [id]: (cart[id] || 0) + 1 };
    saveCart(next);
  };

  const removeFromCart = (id) => {
    const next = { ...cart };
    if (!next[id]) return;
    if (next[id] <= 1) delete next[id];
    else next[id] -= 1;
    saveCart(next);
  };

  const cartEntries = Object.entries(cart)
    .map(([id, qty]) => {
      const item = perfumes.find((p) => p.id === id);
      return item ? { item, qty } : null;
    })
    .filter(Boolean);

  const totalCartCount = cartEntries.reduce((sum, entry) => sum + entry.qty, 0);
  const totalCartPrice = cartEntries.reduce(
    (sum, entry) => sum + effectivePrice(entry.item) * entry.qty,
    0
  );

  const submitOrder = async () => {
    if (!customerName.trim() || !customerPhone.trim()) {
      Alert.alert('Maglumat gerek', 'Adyňyzy we telefon belgiňizi ýazyň.');
      return;
    }
    if (cartEntries.length === 0) return;

    const newOrder = {
      id: 'ord-' + Date.now(),
      createdAt: new Date().toLocaleString('tk-TM'),
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      note: customerNote.trim(),
      items: cartEntries.map(({ item, qty }) => ({
        id: item.id,
        name: item.name,
        qty,
        unitPrice: effectivePrice(item),
      })),
      totalAmount: totalCartPrice,
      status: 'Täze sargyt',
    };

    const updatedPerfumes = perfumes.map((p) => {
      const bought = cart[p.id] || 0;
      return bought > 0 ? { ...p, soldCount: Number(p.soldCount || 0) + bought } : p;
    });

    const nextOrders = [newOrder, ...orders];
    setPerfumes(sortAZ(updatedPerfumes));
    await AsyncStorage.setItem(STORAGE_KEYS.PERFUMES, JSON.stringify(sortAZ(updatedPerfumes)));
    await saveOrders(nextOrders, updatedPerfumes);
    await saveCart({});

    setCustomerName('');
    setCustomerPhone('+993 ');
    setCustomerNote('');
    setCheckoutVisible(false);
    Alert.alert(
      'Sargydyňyz kabul edildi',
      'Sargydyňyz Admin panele ugradyldy. Tiz wagtda SMS ýa-da jaň arkaly habar berler.'
    );
  };

  const notifyCustomerSMS = (order) => {
    const msg = encodeURIComponent(
      `Salam ${order.customerName}! Allanur&Jemile atyr dükanyndan sargydyňyz (${order.totalAmount} TMT) kabul edildi.`
    );
    const phone = order.customerPhone.replace(/\s+/g, '');
    Linking.openURL(`sms:${phone}?body=${msg}`).catch(() =>
      Alert.alert('Ýalňyşlyk', 'SMS programmasyny açyp bolmady.')
    );
  };

  const notifyCustomerCall = (order) => {
    const phone = order.customerPhone.replace(/\s+/g, '');
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert('Ýalňyşlyk', 'Jaň etmek mümkin bolmady.')
    );
  };

  const openAdmin = () => {
    setPasscodeInput('');
    setPasscodeModalVisible(true);
  };

  const verifyPasscode = () => {
    if (passcodeInput.trim() === ADMIN_PASSCODE) {
      setPasscodeModalVisible(false);
      setAdminUnlocked(true);
      setScreen('admin');
    } else {
      Alert.alert('Nädogry kod', 'Admin kody nädogry girizildi.');
    }
  };

  const exitAdminToUserPanel = () => {
    setAdminUnlocked(false);
    setPasscodeInput('');
    setScreen('home');
  };

  const pickImageFromDevice = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Rugsat gerek', 'Surat saýlamak üçin galereýa rugsat beriň.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
      base64: true,
    });
    if (!res.canceled && res.assets && res.assets[0]) {
      const asset = res.assets[0];
      const uri = asset.base64
        ? `data:image/jpeg;base64,${asset.base64}`
        : asset.uri;
      setImgUri(uri);
      setImgUrlInput('');
      setImgStatus('ok');
    }
  };

  const onChangeUrlInput = (val) => {
    setImgUrlInput(val);
    setImgUri(val.trim());
    setImgStatus('idle');
  };

  const addPerfumeInAdmin = async () => {
    if (!nameInput.trim() || !priceInput.trim()) {
      Alert.alert('Maglumat ýetmezçilik edýär', 'Duhynyň adyny we bahasyny ýazyň.');
      return;
    }
    const finalImage = imgUri.trim() || INITIAL_PERFUMES[0].imageUrl;
    const newItem = {
      id: 'p-' + Date.now(),
      name: nameInput.trim(),
      price: Number(priceInput) || 0,
      salePrice: salePriceInput.trim() ? Number(salePriceInput) : null,
      soldCount: Number(soldInput) || 0,
      volumeMl: Number(volumeInput) || 100,
      longevityHours: Number(longevityInput) || 12,
      imageUrl: finalImage,
    };

    await savePerfumes([...perfumes, newItem]);
    setNameInput('');
    setPriceInput('');
    setSalePriceInput('');
    setSoldInput('0');
    setVolumeInput('100');
    setLongevityInput('12');
    setImgUri('');
    setImgUrlInput('');
    setImgStatus('idle');
    Alert.alert('Goşuldy', `"${newItem.name}" A-Z tertibine goşuldy we beýleki ulanyja iberildi.`);
  };

  const deletePerfumeInAdmin = async (id) => {
    const filtered = perfumes.filter((p) => p.id !== id);
    await savePerfumes(filtered);
  };

  const exportJSON = async () => {
    try {
      const payload = {
        app: 'Allanur&Jemile (A.J)',
        exportedAt: new Date().toISOString(),
        perfumes,
        cart,
        orders,
      };
      const fileUri = FileSystem.documentDirectory + 'allanur_jemile_backup.json';
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(payload, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Allanur&Jemile JSON göçürip almak',
        });
      } else {
        Alert.alert('Taýýar', `Faýl ýatda saklandy:\n${fileUri}`);
      }
    } catch (e) {
      Alert.alert('Ýalňyşlyk', 'JSON göçürip alyp bolmady.');
    }
  };

  const importJSON = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || !res.assets[0]) return;
      const content = await FileSystem.readAsStringAsync(res.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.perfumes)) {
        await savePerfumes(parsed.perfumes);
      }
      if (parsed.cart && typeof parsed.cart === 'object') {
        await saveCart(parsed.cart);
      }
      if (Array.isArray(parsed.orders)) {
        await saveOrders(parsed.orders);
      }
      Alert.alert('Üstünlikli', 'JSON maglumatlary täzeden ýüklendi.');
    } catch (e) {
      Alert.alert('Ýalňyşlyk', 'JSON faýly okap bolmady.');
    }
  };

  const netColor =
    netStatus === 'online'
      ? theme.online
      : netStatus === 'connecting'
      ? theme.connecting
      : theme.offline;

  const netLabel =
    netStatus === 'online'
      ? 'Online'
      : netStatus === 'connecting'
      ? 'Garşylaýar...'
      : 'Offline';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar style={activeMode === 'light' ? 'dark' : 'light'} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={styles.brandRow}>
          <View style={[styles.logoBadge, { backgroundColor: theme.primary }]}>
            <Text style={styles.logoText}>A.J</Text>
          </View>
          <View>
            <Text style={[styles.brandName, { color: theme.text }]}>Allanur&Jemile</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: netColor }]} />
              <Text style={[styles.statusLabel, { color: netColor }]}>{netLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.themeGroup, { backgroundColor: theme.surfaceAlt }]}>
            {['light', 'dark', 'system'].map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => changeThemeMode(m)}
                style={[
                  styles.themeBtn,
                  themeMode === m && { backgroundColor: theme.primary },
                ]}
              >
                <Text
                  style={[
                    styles.themeBtnText,
                    { color: themeMode === m ? theme.primaryText : theme.textMuted },
                  ]}
                >
                  {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'System'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {screen !== 'admin' && (
            <TouchableOpacity
              onPress={openAdmin}
              style={[styles.adminCornerBtn, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.adminCornerBtnText}>Admin</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {screen === 'home' && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Iň köp satylan duhydar
          </Text>
          <ScrollView
            ref={carouselRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.carousel}
          >
            {topSellers.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.9}
                onPress={() => setZoomedPerfume(item)}
                style={[
                  styles.carouselCard,
                  { width: SCREEN_WIDTH - 32, backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.carouselImage}
                  resizeMode="cover"
                />
                <View style={styles.carouselMeta}>
                  <Text style={[styles.carouselTitle, { color: theme.text }]}>{item.name}</Text>
                  <Text style={[styles.carouselSub, { color: theme.textMuted }]}>
                    {item.soldCount} sany satyldy • {item.volumeMl} ml • {item.longevityHours} sagat
                  </Text>
                  <View style={styles.priceRow}>
                    <Text style={[styles.mainPrice, { color: theme.primary }]}>
                      {effectivePrice(item)} TMT
                    </Text>
                    {item.salePrice && (
                      <Text style={[styles.oldPrice, { color: theme.textMuted }]}>
                        {item.price} TMT
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Ähli duhydar (A – Z)
          </Text>
          {perfumes.map((item) => {
            const qtyInCart = cart[item.id] || 0;
            return (
              <View
                key={item.id}
                style={[
                  styles.perfumeCard,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <TouchableOpacity onPress={() => setZoomedPerfume(item)}>
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={styles.perfumeThumb}
                    resizeMode="cover"
                  />
                </TouchableOpacity>

                <View style={styles.perfumeInfo}>
                  <Text style={[styles.perfumeName, { color: theme.text }]}>{item.name}</Text>
                  <Text style={[styles.perfumeSpecs, { color: theme.textMuted }]}>
                    {item.volumeMl} ml • {item.longevityHours} sagat • {item.soldCount} satyldy
                  </Text>
                  <View style={styles.priceRow}>
                    <Text style={[styles.mainPrice, { color: theme.primary }]}>
                      {effectivePrice(item)} TMT
                    </Text>
                    {item.salePrice && (
                      <Text style={[styles.oldPrice, { color: theme.textMuted }]}>
                        {item.price} TMT
                      </Text>
                    )}
                  </View>

                  <View style={styles.cartActions}>
                    <TouchableOpacity
                      onPress={() => addToCart(item.id)}
                      style={[styles.addBtn, { backgroundColor: theme.primary }]}
                    >
                      <Text style={styles.addBtnText}>Sebede goş</Text>
                    </TouchableOpacity>

                    {qtyInCart > 0 && (
                      <TouchableOpacity
                        onPress={() => removeFromCart(item.id)}
                        style={[styles.removeBtn, { backgroundColor: theme.accent }]}
                      >
                        <Text style={styles.removeBtnText}>Aýyrmak ({qtyInCart})</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {screen === 'cart' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Sebet</Text>

          <View style={[styles.summaryBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.summaryText, { color: theme.text }]}>
              Alan duhylaryň sany: {totalCartCount} sany
            </Text>
            <Text style={[styles.summaryTotal, { color: theme.primary }]}>
              Umumy jemi baha: {totalCartPrice} TMT
            </Text>
          </View>

          {cartEntries.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              Sebediňiz häzirlikçe boş.
            </Text>
          ) : (
            cartEntries.map(({ item, qty }) => (
              <View
                key={item.id}
                style={[styles.cartItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.perfumeName, { color: theme.text }]}>{item.name}</Text>
                  <Text style={[styles.perfumeSpecs, { color: theme.textMuted }]}>
                    {qty} sany × {effectivePrice(item)} TMT = {qty * effectivePrice(item)} TMT
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => addToCart(item.id)}
                    style={[styles.miniBtn, { backgroundColor: theme.primary }]}
                  >
                    <Text style={styles.addBtnText}>+</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removeFromCart(item.id)}
                    style={[styles.miniBtn, { backgroundColor: theme.accent }]}
                  >
                    <Text style={styles.addBtnText}>Aýyrmak</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {cartEntries.length > 0 && (
            <TouchableOpacity
              onPress={() => setCheckoutVisible(true)}
              style={[styles.checkoutBtn, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.checkoutBtnText}>Sargyt et ({totalCartPrice} TMT)</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {screen === 'admin' && adminUnlocked && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity
            onPress={exitAdminToUserPanel}
            style={[styles.exitAdminBtn, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.checkoutBtnText}>Ulanyjy panele çyk</Text>
          </TouchableOpacity>

          {/* 2-User Shared Cloud Sync Box */}
          <View style={[styles.adminBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 0 }]}>
              2 adam arasynda paýlaşylan baza
            </Text>
            <Text style={[styles.perfumeSpecs, { color: theme.online, marginBottom: 8 }]}>
              {syncStatusText}
            </Text>
            <TextInput
              placeholder="Firebase Realtime DB URL (https://...firebaseio.com)"
              placeholderTextColor={theme.textMuted}
              value={syncUrl}
              onChangeText={setSyncUrl}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
            />
            <TextInput
              placeholder="Umumy otag ady (mysal: allanur_jemile_store)"
              placeholderTextColor={theme.textMuted}
              value={syncRoom}
              onChangeText={setSyncRoom}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={handleSaveSyncConfig}
                style={[styles.addBtn, { backgroundColor: theme.primary, flex: 1, alignItems: 'center' }]}
              >
                <Text style={styles.addBtnText}>Baglanyşygy sakla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => syncFromCloud(false)}
                style={[styles.addBtn, { backgroundColor: theme.online, flex: 1, alignItems: 'center' }]}
              >
                <Text style={styles.addBtnText}>Täzele</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.jsonRow}>
            <TouchableOpacity
              onPress={exportJSON}
              style={[styles.jsonBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Text style={[styles.jsonBtnText, { color: theme.text }]}>JSON Göçürip al</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={importJSON}
              style={[styles.jsonBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Text style={[styles.jsonBtnText, { color: theme.text }]}>JSON Ýükle</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.adminBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Täze duhy goşmak</Text>

            <TouchableOpacity
              onPress={pickImageFromDevice}
              style={[styles.pickImgBtn, { backgroundColor: theme.surfaceAlt }]}
            >
              <Text style={[styles.pickImgText, { color: theme.text }]}>
                Surat saýla (Ähli formatlar)
              </Text>
            </TouchableOpacity>

            <TextInput
              placeholder="Internet platformadan surat URL ýazyň..."
              placeholderTextColor={theme.textMuted}
              value={imgUrlInput}
              onChangeText={onChangeUrlInput}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
            />

            {!!imgUri && (
              <View style={styles.previewBox}>
                <Image
                  source={{ uri: imgUri }}
                  style={styles.previewImg}
                  onLoad={() => setImgStatus('ok')}
                  onError={() => setImgStatus('error')}
                />
                <Text
                  style={{
                    color:
                      imgStatus === 'ok'
                        ? theme.online
                        : imgStatus === 'error'
                        ? theme.offline
                        : theme.textMuted,
                    fontWeight: '600',
                    marginTop: 6,
                  }}
                >
                  {imgStatus === 'ok'
                    ? 'Surat açyldy'
                    : imgStatus === 'error'
                    ? 'Surat açylmady (URL ýa-da faýly barlaň)'
                    : 'Surat barlanýar...'}
                </Text>
              </View>
            )}

            <TextInput
              placeholder="Duhynyň ady"
              placeholderTextColor={theme.textMuted}
              value={nameInput}
              onChangeText={setNameInput}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
            />
            <TextInput
              placeholder="Bahasy (TMT)"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              value={priceInput}
              onChangeText={setPriceInput}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
            />
            <TextInput
              placeholder="Aksiýadaky bahasy (hökmany däl)"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              value={salePriceInput}
              onChangeText={setSalePriceInput}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
            />
            <TextInput
              placeholder="Näçe sanysy satyldy"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              value={soldInput}
              onChangeText={setSoldInput}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
            />
            <TextInput
              placeholder="Näçe milligram (ml)"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              value={volumeInput}
              onChangeText={setVolumeInput}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
            />
            <TextInput
              placeholder="Näçe sagat durýar"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              value={longevityInput}
              onChangeText={setLongevityInput}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
            />

            <TouchableOpacity
              onPress={addPerfumeInAdmin}
              style={[styles.checkoutBtn, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.checkoutBtnText}>Goş (A–Z tertibine)</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Sargalan duhylar ({orders.length})
          </Text>
          {orders.map((ord) => (
            <View
              key={ord.id}
              style={[styles.orderCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Text style={[styles.perfumeName, { color: theme.text }]}>
                {ord.customerName} • {ord.customerPhone}
              </Text>
              <Text style={[styles.perfumeSpecs, { color: theme.textMuted }]}>{ord.createdAt}</Text>
              {ord.items.map((it, idx) => (
                <Text key={idx} style={{ color: theme.text, marginTop: 2 }}>
                  • {it.name} × {it.qty} ({it.unitPrice * it.qty} TMT)
                </Text>
              ))}
              <Text style={[styles.mainPrice, { color: theme.primary, marginTop: 6 }]}>
                Jemi: {ord.totalAmount} TMT
              </Text>
              <View style={styles.notifyRow}>
                <TouchableOpacity
                  onPress={() => notifyCustomerSMS(ord)}
                  style={[styles.notifyBtn, { backgroundColor: theme.primary }]}
                >
                  <Text style={styles.addBtnText}>SMS ugrat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => notifyCustomerCall(ord)}
                  style={[styles.notifyBtn, { backgroundColor: theme.online }]}
                >
                  <Text style={styles.addBtnText}>Jaň et</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Bar bolan duhylar ({perfumes.length})
          </Text>
          {perfumes.map((p) => (
            <View
              key={p.id}
              style={[styles.cartItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.perfumeName, { color: theme.text }]}>{p.name}</Text>
                <Text style={[styles.perfumeSpecs, { color: theme.textMuted }]}>
                  {effectivePrice(p)} TMT • {p.volumeMl} ml • {p.longevityHours} sagat • {p.soldCount} satyldy
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => deletePerfumeInAdmin(p.id)}
                style={[styles.miniBtn, { backgroundColor: theme.accent }]}
              >
                <Text style={styles.addBtnText}>Poz</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {screen !== 'admin' && (
        <View style={[styles.bottomBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <TouchableOpacity onPress={() => setScreen('home')} style={styles.tabBtn}>
            <Text
              style={[
                styles.tabLabel,
                { color: screen === 'home' ? theme.primary : theme.textMuted },
              ]}
            >
              Baş sahypa
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setScreen('cart')} style={styles.tabBtn}>
            <Text
              style={[
                styles.tabLabel,
                { color: screen === 'cart' ? theme.primary : theme.textMuted },
              ]}
            >
              Sebet ({totalCartCount})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={passcodeModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Admin koduny giriziň</Text>
            <TextInput
              placeholder="Kod"
              placeholderTextColor={theme.textMuted}
              secureTextEntry
              keyboardType="numeric"
              value={passcodeInput}
              onChangeText={setPasscodeInput}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => setPasscodeModalVisible(false)}
                style={[styles.modalBtn, { backgroundColor: theme.surfaceAlt, flex: 1 }]}
              >
                <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Ýatyr</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={verifyPasscode}
                style={[styles.modalBtn, { backgroundColor: theme.primary, flex: 1 }]}
              >
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Girmek</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={checkoutVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Sargyt maglumatlary</Text>
            <TextInput
              placeholder="Müşderiniň ady"
              placeholderTextColor={theme.textMuted}
              value={customerName}
              onChangeText={setCustomerName}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
            />
            <TextInput
              placeholder="Telefon belgisi (+993...)"
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              value={customerPhone}
              onChangeText={setCustomerPhone}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
            />
            <TextInput
              placeholder="Salgy / bellik"
              placeholderTextColor={theme.textMuted}
              value={customerNote}
              onChangeText={setCustomerNote}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => setCheckoutVisible(false)}
                style={[styles.modalBtn, { backgroundColor: theme.surfaceAlt, flex: 1 }]}
              >
                <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Ýatyr</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitOrder}
                style={[styles.modalBtn, { backgroundColor: theme.primary, flex: 1 }]}
              >
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Tassykla</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!zoomedPerfume} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setZoomedPerfume(null)}
          style={styles.zoomOverlay}
        >
          {zoomedPerfume && (
            <View style={[styles.zoomCard, { backgroundColor: theme.surface }]}>
              <Image
                source={{ uri: zoomedPerfume.imageUrl }}
                style={styles.zoomImage}
                resizeMode="contain"
              />
              <Text style={[styles.zoomTitle, { color: theme.text }]}>{zoomedPerfume.name}</Text>
              <Text style={[styles.perfumeSpecs, { color: theme.textMuted }]}>
                {zoomedPerfume.volumeMl} ml • {zoomedPerfume.longevityHours} sagat • {effectivePrice(zoomedPerfume)} TMT
              </Text>
              <TouchableOpacity
                onPress={() => setZoomedPerfume(null)}
                style={[styles.addBtn, { backgroundColor: theme.primary, marginTop: 12 }]}
              >
                <Text style={styles.addBtnText}>Ýap</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  brandName: { fontWeight: '700', fontSize: 15 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 11, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  themeGroup: { flexDirection: 'row', borderRadius: 8, padding: 2 },
  themeBtn: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
  themeBtnText: { fontSize: 10, fontWeight: '700' },
  adminCornerBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  adminCornerBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 10, marginTop: 6 },
  carousel: { marginBottom: 16 },
  carouselCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginRight: 12,
  },
  carouselImage: { width: '100%', height: 185 },
  carouselMeta: { padding: 12 },
  carouselTitle: { fontSize: 16, fontWeight: '800' },
  carouselSub: { fontSize: 12, marginTop: 3 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  mainPrice: { fontSize: 15, fontWeight: '800' },
  oldPrice: { fontSize: 13, textDecorationLine: 'line-through' },
  perfumeCard: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
    gap: 12,
  },
  perfumeThumb: { width: 92, height: 104, borderRadius: 10 },
  perfumeInfo: { flex: 1, justifyContent: 'space-between' },
  perfumeName: { fontSize: 15, fontWeight: '700' },
  perfumeSpecs: { fontSize: 12, marginTop: 2 },
  cartActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  addBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  removeBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  removeBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  summaryBox: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    gap: 6,
  },
  summaryText: { fontSize: 15, fontWeight: '700' },
  summaryTotal: { fontSize: 18, fontWeight: '800' },
  emptyText: { textAlign: 'center', marginTop: 30, fontSize: 14 },
  cartItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  miniBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  checkoutBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  checkoutBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  exitAdminBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  jsonRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  jsonBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  jsonBtnText: { fontWeight: '700', fontSize: 13 },
  adminBox: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  pickImgBtn: { padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  pickImgText: { fontWeight: '700', fontSize: 13 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 14,
  },
  previewBox: { alignItems: 'center', marginBottom: 12 },
  previewImg: { width: 120, height: 120, borderRadius: 10 },
  orderCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  notifyRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  notifyBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  bottomBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 10,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  tabLabel: { fontSize: 14, fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { borderRadius: 16, borderWidth: 1, padding: 18 },
  modalBtn: { paddingVertical: 12, borderRadius: 10 },
  zoomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    padding: 18,
  },
  zoomCard: { borderRadius: 16, padding: 16, alignItems: 'center' },
  zoomImage: { width: '100%', height: 320, borderRadius: 12 },
  zoomTitle: { fontSize: 18, fontWeight: '800', marginTop: 12 },
});
