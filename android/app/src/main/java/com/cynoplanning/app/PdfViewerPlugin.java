package com.cynoplanning.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.List;

@CapacitorPlugin(name = "PdfViewer")
public class PdfViewerPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null || uriString.isEmpty()) {
            call.reject("Missing file URI");
            return;
        }

        try {
            Uri contentUri = toReadableUri(uriString);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(contentUri, "application/pdf");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            List<ResolveInfo> targets = getContext()
                .getPackageManager()
                .queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
            for (ResolveInfo target : targets) {
                getContext()
                    .grantUriPermission(
                        target.activityInfo.packageName,
                        contentUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    );
            }

            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No PDF viewer available");
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Unable to open PDF");
        }
    }

    private Uri toReadableUri(String uriString) {
        Uri parsed = Uri.parse(uriString);
        String scheme = parsed.getScheme();
        if (scheme != null && scheme.equalsIgnoreCase("content")) {
            return parsed;
        }

        File file = new File(parsed.getPath() != null ? parsed.getPath() : uriString);
        return FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            file
        );
    }
}
