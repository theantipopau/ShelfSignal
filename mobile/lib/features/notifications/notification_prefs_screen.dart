import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../core/repository.dart';
import '../common/live_only_notice.dart';

/// Notification preferences (spec 9.11). Every change is saved straight away
/// and the server's copy replaces the local one.
class NotificationPrefsScreen extends ConsumerStatefulWidget {
  const NotificationPrefsScreen({super.key});

  @override
  ConsumerState<NotificationPrefsScreen> createState() => _NotificationPrefsScreenState();
}

// ponytail: fixed cooldown choices; the API accepts any whole number of hours 0–168.
const _cooldownChoices = [0, 6, 12, 24, 48, 168];

class _NotificationPrefsScreenState extends ConsumerState<NotificationPrefsScreen> {
  NotificationPrefs? _prefs;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (!ref.read(repositoryProvider).isDemo) _load();
  }

  Future<void> _load() async {
    try {
      final prefs = await ref.read(repositoryProvider).getNotificationPrefs();
      if (mounted) setState(() => _prefs = prefs);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _save(Map<String, dynamic> patch) async {
    try {
      final saved = await ref.read(repositoryProvider).updateNotificationPrefs(patch);
      if (mounted) setState(() => _prefs = saved);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _pickTime(String field, String current) async {
    final parts = current.split(':');
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1])),
    );
    if (picked == null) return;
    final hh = picked.hour.toString().padLeft(2, '0');
    final mm = picked.minute.toString().padLeft(2, '0');
    await _save({field: '$hh:$mm'});
  }

  @override
  Widget build(BuildContext context) {
    if (ref.watch(repositoryProvider).isDemo) {
      return const LiveOnlyNotice(title: 'Notification preferences');
    }
    final prefs = _prefs;

    return Scaffold(
      appBar: AppBar(title: const Text('Notification preferences')),
      body: _error != null
          ? Center(child: Text(_error!))
          : prefs == null
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  children: [
                    SwitchListTile(
                      title: const Text('Send me signals'),
                      subtitle: const Text('Turn off to pause everything'),
                      value: prefs.globalEnabled,
                      onChanged: (v) => _save({'global_enabled': v}),
                    ),
                    SwitchListTile(
                      title: const Text('Immediate high-value alerts'),
                      subtitle: const Text('Delivered even during quiet hours'),
                      value: prefs.immediateHighValueEnabled,
                      onChanged: (v) => _save({'immediate_high_value_enabled': v}),
                    ),
                    SwitchListTile(
                      title: const Text('Daily digest'),
                      subtitle: const Text('Group routine signals into one message'),
                      value: prefs.digestMode,
                      onChanged: (v) => _save({'digest_mode': v}),
                    ),
                    SwitchListTile(
                      title: const Text('Quiet hours'),
                      value: prefs.quietHoursEnabled,
                      onChanged: (v) => _save({'quiet_hours_enabled': v}),
                    ),
                    ListTile(
                      enabled: prefs.quietHoursEnabled,
                      title: const Text('Quiet from'),
                      trailing: Text(prefs.quietHoursStart),
                      onTap: () => _pickTime('quiet_hours_start', prefs.quietHoursStart),
                    ),
                    ListTile(
                      enabled: prefs.quietHoursEnabled,
                      title: const Text('Quiet until'),
                      trailing: Text(prefs.quietHoursEnd),
                      onTap: () => _pickTime('quiet_hours_end', prefs.quietHoursEnd),
                    ),
                    ListTile(
                      title: const Text('Cooldown per product'),
                      subtitle: const Text('Minimum wait before the same product alerts again'),
                      trailing: DropdownButton<int>(
                        value: _cooldownChoices.contains(prefs.cooldownHours)
                            ? prefs.cooldownHours
                            : 24,
                        items: [
                          for (final h in _cooldownChoices)
                            DropdownMenuItem(
                              value: h,
                              child: Text(h == 0 ? 'None' : h < 24 ? '$h h' : '${h ~/ 24} d'),
                            ),
                        ],
                        onChanged: (v) {
                          if (v != null) _save({'per_product_cooldown_hours': v});
                        },
                      ),
                    ),
                    SwitchListTile(
                      title: const Text('Household activity'),
                      subtitle: const Text('When someone you share with completes or adds an item'),
                      value: prefs.householdActivityEnabled,
                      onChanged: (v) => _save({'household_activity_enabled': v}),
                    ),
                    SwitchListTile(
                      title: const Text('Alcohol alerts'),
                      subtitle: const Text('Only for accounts that confirmed they are 18+'),
                      value: prefs.alcoholAlertsEnabled,
                      onChanged: (v) => _save({'alcohol_alerts_enabled': v}),
                    ),
                  ],
                ),
    );
  }
}
