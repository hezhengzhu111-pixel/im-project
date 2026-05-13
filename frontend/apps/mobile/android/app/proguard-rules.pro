# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# Preserve annotation-driven keep markers used by React Native and JNI bridges.
-keep class com.facebook.proguard.annotations.DoNotStrip
-keep @com.facebook.proguard.annotations.DoNotStrip class * { *; }
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    native <methods>;
}
-keepattributes *Annotation*,InnerClasses,EnclosingMethod,Signature

# Keep the main RN bridge and app-local native modules conservative while
# release minify remains optional and library coverage is still being hardened.
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.fbreact.specs.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.immobile.ConfigModule { *; }
-keep class com.immobile.ConfigPackage { *; }

# React Native ecosystem libraries that rely on JNI, reflection, or generated glue.
-keep class io.invertase.firebase.** { *; }
-keep class io.invertase.notifee.** { *; }
-keep class app.notifee.core.** { *; }
-keep class com.reactnativemmkv.** { *; }
-keep class com.reactnativequicksqlite.** { *; }
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.margelo.** { *; }

# Avoid noisy warnings from optional/variant native integrations during guarded release builds.
-dontwarn io.invertase.firebase.**
-dontwarn io.invertase.notifee.**
-dontwarn app.notifee.core.**
-dontwarn com.reactnativemmkv.**
-dontwarn com.reactnativequicksqlite.**
-dontwarn com.swmansion.reanimated.**
-dontwarn com.swmansion.worklets.**
-dontwarn com.margelo.**
