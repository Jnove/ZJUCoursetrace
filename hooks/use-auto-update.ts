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
            // 读取自动更新开关，默认为 true
            const autoUpdateEnabledStr = await AsyncStorage.getItem('autoUpdateEnabled');
            const autoUpdateEnabled = autoUpdateEnabledStr === null ? true : autoUpdateEnabledStr === 'true';
            if (!autoUpdateEnabled) return; // 关闭自动更新，不检查

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
                console.error('自动更新检查失败', error);
            }
        };

        check();
    }, []);

    return modalState;
}