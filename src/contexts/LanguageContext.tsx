import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'fa';

interface Translations {
  appName: string;
  secureMessaging: string;
  fullName: string;
  username: string;
  password: string;
  signIn: string;
  signUp: string;
  joinNow: string;
  alreadyMember: string;
  continueWithGoogle: string;
  processing: string;
  settings: string;
  chats: string;
  logout: string;
  profile: string;
  editProfile: string;
  displayName: string;
  bio: string;
  saveChanges: string;
  searching: string;
  noChats: string;
  startMessaging: string;
  typeMessage: string;
  online: string;
  lastSeen: string;
  appearance: string;
  language: string;
  darkMode: string;
  selectLanguage: string;
  searchPlaceholder: string;
  errorUsernameTaken: string;
  errorUserNotFound: string;
  errorInvalidCreds: string;
  errorGeneral: string;
}

const translations: Record<Language, Translations> = {
  en: {
    appName: 'Cloud Messenger',
    secureMessaging: 'Join the next generation of secure messaging.',
    fullName: 'Full Name',
    username: 'Username',
    password: 'Password',
    signIn: 'Sign In',
    signUp: 'Sign Up',
    joinNow: "Don't have an account? Join Now",
    alreadyMember: 'Already member? Sign In',
    continueWithGoogle: 'Sign in with Google',
    processing: 'Processing...',
    settings: 'Settings',
    chats: 'Chats',
    logout: 'Logout',
    profile: 'Profile',
    editProfile: 'Edit Profile',
    displayName: 'Display Name',
    bio: 'Bio',
    saveChanges: 'Save Changes',
    searching: 'Searching...',
    noChats: 'No chats yet',
    startMessaging: 'Select a chat to start messaging',
    typeMessage: 'Type a message...',
    online: 'Online',
    lastSeen: 'Last seen',
    appearance: 'Appearance',
    language: 'Language',
    darkMode: 'Dark Mode',
    selectLanguage: 'Select Language',
    searchPlaceholder: 'Search users...',
    errorUsernameTaken: 'This username is already taken.',
    errorUserNotFound: 'User not found.',
    errorInvalidCreds: 'Invalid username or password.',
    errorGeneral: 'An error occurred. Please try again.',
  },
  fa: {
    appName: 'کلاود مسنجر',
    secureMessaging: 'به نسل جدید پیام‌رسان‌های امن بپیوندید.',
    fullName: 'نام کامل',
    username: 'نام کاربری',
    password: 'رمز عبور',
    signIn: 'ورود',
    signUp: 'ثبت‌نام',
    joinNow: 'حساب کاربری ندارید؟ عضو شوید',
    alreadyMember: 'قبلاً عضو شده‌اید؟ وارد شوید',
    continueWithGoogle: 'ورود با گوگل',
    processing: 'در حال پردازش...',
    settings: 'تنظیمات',
    chats: 'گفتگوها',
    logout: 'خروج',
    profile: 'پروفایل',
    editProfile: 'ویرایش پروفایل',
    displayName: 'نام نمایشی',
    bio: 'بیوگرافی',
    saveChanges: 'ذخیره تغییرات',
    searching: 'در حال جستجو...',
    noChats: 'هنوز گفتگویی ندارید',
    startMessaging: 'برای شروع پیام‌رسانی یک گفتگو را انتخاب کنید',
    typeMessage: 'پیام خود را بنویسید...',
    online: 'آنلاین',
    lastSeen: 'آخرین بازدید',
    appearance: 'ظاهر برنامه',
    language: 'زبان',
    darkMode: 'حالت تاریک',
    selectLanguage: 'انتخاب زبان',
    searchPlaceholder: 'جستجوی کاربران...',
    errorUsernameTaken: 'این نام کاربری قبلاً انتخاب شده است.',
    errorUserNotFound: 'کاربر یافت نشد.',
    errorInvalidCreds: 'نام کاربری یا رمز عبور اشتباه است.',
    errorGeneral: 'خطایی رخ داد. لطفا دوباره تلاش کنید.',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('app_language') as Language) || 'en';
  });

  useEffect(() => {
    localStorage.setItem('app_language', language);
    document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  const value = {
    language,
    setLanguage,
    t: translations[language],
    isRTL: language === 'fa',
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
