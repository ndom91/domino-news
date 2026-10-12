import 'react-native-url-polyfill/auto'
import { isExpoGo } from './lib/expo-go'

if (!isExpoGo) {
  require('./lib/for-you-alerts-task')
}

import 'expo-router/entry'
