import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:spatius_avatarkit/spatius_avatarkit.dart' as ak;

/// Shown next to the clip list so nobody reads the bundled files as the limit of
/// what Direct Mode accepts.
const audioSourceHint =
    'These clips are bundled samples, not a limitation. send() takes any PCM16 audio '
    'at the configured sample rate — stream it live from a microphone, a TTS service, '
    'or your own pipeline the same way. The demo ships files so it runs without extra setup.';

const _audioFiles = [
  'demo_pcm_audio1.pcm',
  'demo_pcm_audio2.pcm',
  'demo_pcm_audio3.pcm',
  'speech.pcm',
];

enum ToastKind { error, warning }

class ToastMessage {
  const ToastMessage(this.text, {this.kind = ToastKind.error});

  final String text;
  final ToastKind kind;
}

class AvatarViewModel extends ChangeNotifier {
  // --- Public state ---
  String connectionState = 'disconnected';
  String conversationState = 'idle';
  String? errorMessage;
  ak.Avatar? avatar;
  bool isSendingAudio = false;
  String? currentlyPlayingFile;

  /// Set by the page so failures and blocked actions surface in the UI
  /// instead of only reaching [errorMessage].
  void Function(ToastMessage)? onToast;

  List<String> get audioFiles => _audioFiles;

  // --- Private ---
  ak.AvatarController? _controller;
  bool _isConnected = false;
  Completer<void>? _sendCanceller;

  // --- Controller ---

  void setAvatarController(ak.AvatarController controller) {
    _controller = controller;

    controller.onConnectionState = (state, errorMsg) {
      connectionState = state.name;
      _isConnected = state == ak.ConnectionState.connected;
      if (state == ak.ConnectionState.disconnected ||
          state == ak.ConnectionState.failed) {
        _cancelSending();
      }
      notifyListeners();
    };

    controller.onConversationState = (state) {
      conversationState = state.name;
      notifyListeners();
    };

    controller.onError = (error) {
      errorMessage = error.name;
      onToast?.call(ToastMessage(error.name));
      notifyListeners();
    };
  }

  // --- Lifecycle ---

  void start() => _controller?.start();

  void pause() => _controller?.pause();

  void resume() => _controller?.resume();

  void interrupt() {
    _cancelSending();
    _controller?.interrupt();
  }

  void close() {
    _cancelSending();
    _controller?.close();
  }

  // --- Audio file sending ---

  /// Streams a bundled clip to the avatar.
  ///
  /// The chunking is what matters, not the file: [ak.AvatarController.send] accepts
  /// any PCM16 at the configured sample rate, so a microphone or TTS stream feeds it
  /// the same way — hand it bytes as they arrive and mark the final chunk with `end`.
  Future<void> sendAudioFile(String filename) async {
    // Direct Mode has no session until start() runs, so audio sent now would
    // be dropped silently. Say so instead of leaving a dead button.
    if (!_isConnected) {
      onToast?.call(const ToastMessage(
        'Please tap Start to connect before sending audio.',
        kind: ToastKind.warning,
      ));
      return;
    }

    final controller = _controller;
    if (controller == null) return;

    _cancelSending();
    controller.interrupt();

    Uint8List audioData;
    try {
      final byteData = await rootBundle.load('assets/$filename');
      audioData = byteData.buffer.asUint8List();
    } catch (e) {
      errorMessage = 'Cannot read $filename';
      onToast?.call(ToastMessage('Cannot read $filename'));
      notifyListeners();
      return;
    }

    isSendingAudio = true;
    currentlyPlayingFile = filename;
    notifyListeners();

    final canceller = Completer<void>();
    _sendCanceller = canceller;

    // 1 second of 16kHz 16-bit mono = 32000 bytes
    const chunkSize = 32000;
    var offset = 0;

    while (offset < audioData.length && !canceller.isCompleted && _isConnected) {
      final end = (offset + chunkSize).clamp(0, audioData.length);
      final isLast = end >= audioData.length;
      final chunk = audioData.sublist(offset, end);
      controller.send(chunk, end: isLast);
      offset = end;
      if (!isLast) {
        await Future.delayed(const Duration(milliseconds: 100));
      }
    }

    if (!canceller.isCompleted) {
      isSendingAudio = false;
      currentlyPlayingFile = null;
      notifyListeners();
    }
  }

  void _cancelSending() {
    _sendCanceller?.complete();
    _sendCanceller = null;
    isSendingAudio = false;
    currentlyPlayingFile = null;
  }

  @override
  void dispose() {
    close();
    super.dispose();
  }
}
