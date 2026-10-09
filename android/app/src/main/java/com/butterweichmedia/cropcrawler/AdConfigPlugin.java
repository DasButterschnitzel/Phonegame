package com.butterweichmedia.cropcrawler;

import android.content.pm.ApplicationInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.UserMessagingPlatform;

/**
 * Hands the web layer this build's ad configuration (set per build type in app/admob.gradle, so a debug APK always
 * carries Google's demo units) and the consent decision UMP keeps between launches. The AdMob plugin only reports
 * canRequestAds() after a successful consent update; offline, the stored decision is all there is.
 */
@CapacitorPlugin(name = "AdConfig")
public class AdConfigPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("debuggable", (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        ret.put("mode", getContext().getString(R.string.admob_mode));
        ret.put("appId", getContext().getString(R.string.admob_app_id));
        ret.put("rewarded", getContext().getString(R.string.admob_rewarded));
        ret.put("rewardedBoost", getContext().getString(R.string.admob_rewarded_boost));
        ret.put("rewardedUpgrade", getContext().getString(R.string.admob_rewarded_upgrade));
        ret.put("rewardedBonus", getContext().getString(R.string.admob_rewarded_bonus));
        ret.put("interstitial", getContext().getString(R.string.admob_interstitial));
        ret.put("testDevices", getContext().getString(R.string.admob_test_devices));
        ret.put("umpDebugGeography", getContext().getString(R.string.admob_ump_debug_geography));
        call.resolve(ret);
    }

    @PluginMethod
    public void consent(PluginCall call) {
        ConsentInformation info = UserMessagingPlatform.getConsentInformation(getContext());
        JSObject ret = new JSObject();
        ret.put("canRequestAds", info.canRequestAds());
        ret.put(
            "privacyOptionsRequired",
            info.getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED
        );
        call.resolve(ret);
    }
}
