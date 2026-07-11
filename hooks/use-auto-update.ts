import { useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    checkForUpdate,
    downloadAndInstallApk,
    openReleasePage,
} from '@/lib/updater';
import { useRouter } from 'expo-router';

interface UpdateModalState {
    visible: boolean;
    title: string;
    message: string;
    buttons: Array<{
        text: string;
        onPress: () => void;
        type?: 'primary' | 'secondary';
    }>;
}

export function useAutoUpdate() {
    const [modalState, setModalState] = useState<UpdateModalState>({
        visible: false,
        title: '',
        message: '',
        buttons: [],
    });
    const hasChecked = useRef(false);
    const router = useRouter();

    useEffect(() => {
        if (hasChecked.current) return;
        hasChecked.current = true;

        const check = async () => {
            // 开发模式不做自动检查（GitHub 未认证 API 限额 60 次/小时/IP，
            // 频繁 reload 很快耗尽并开始报 403）；「关于」页仍可手动检查
            if (__DEV__) return;

            // 读取自动更新开关，默认为 true
            const autoUpdateEnabledStr = await AsyncStorage.getItem('autoUpdateEnabled');
            const autoUpdateEnabled = autoUpdateEnabledStr === null ? true : autoUpdateEnabledStr === 'true';
            if (!autoUpdateEnabled) return; // 关闭自动更新，不检查

            // 6 小时节流：无论上次成功与否都算，避免限流环境下每次冷启动都撞 403
            const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
            const lastStr = await AsyncStorage.getItem('updateLastCheckAt');
            if (lastStr && Date.now() - Number(lastStr) < CHECK_INTERVAL) return;
            await AsyncStorage.setItem('updateLastCheckAt', String(Date.now()));

            try {
                const result = await checkForUpdate();
                if (!result.hasUpdate) return;

                const { latestVersion, releaseNotes, downloadUrl, releaseUrl, currentVersion } = result;
                const notes = releaseNotes?.slice(0, 280) ?? '发现新版本，是否立即更新？';

                const buttons: UpdateModalState['buttons'] = [
                    {
                        text: '稍后',
                        onPress: () => setModalState(prev => ({ ...prev, visible: false })),
                        type: 'secondary',
                    },
                    {
                        text: '查看详情',
                        onPress: () => {
                            openReleasePage(releaseUrl);
                            setModalState(prev => ({ ...prev, visible: false }));
                        },
                        type: 'secondary',
                    },
                ];

                if (Platform.OS === 'android' && downloadUrl) {
                    buttons.push({
                        text: '下载安装',
                        onPress: async () => {
                            router.push("/about");
                            setModalState(prev => ({ ...prev, visible: false }));
                        },
                        type: 'primary',
                    });
                } else {
                    buttons.push({
                        text: '前往更新',
                        onPress: () => {
                            openReleasePage(releaseUrl);
                            setModalState(prev => ({ ...prev, visible: false }));
                        },
                        type: 'primary',
                    });
                }

                setModalState({
                    visible: true,
                    title: `发现新版本 v${latestVersion}`,
                    message: `${notes}\n当前版本 v${currentVersion}`,
                    buttons,
                });
            } catch (error) {
                // 后台静默检查失败（多为 GitHub API 限流）不值得一条 ERROR
                console.log('自动更新检查失败（静默忽略）:', error instanceof Error ? error.message : error);
            }
        };

        check();
    }, []);

    return modalState;
}