package com.gonosia.game.model;

public class ChatMessage {
    private String senderId;
    private String senderName;
    private String content;
    private boolean isGonosiaOnly;

    public ChatMessage() {}

    public ChatMessage(String senderId, String senderName, String content, boolean isGonosiaOnly) {
        this.senderId = senderId;
        this.senderName = senderName;
        this.content = content;
        this.isGonosiaOnly = isGonosiaOnly;
    }

    public String getSenderId() { return senderId; }
    public void setSenderId(String senderId) { this.senderId = senderId; }

    public String getSenderName() { return senderName; }
    public void setSenderName(String senderName) { this.senderName = senderName; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public boolean isGonosiaOnly() { return isGonosiaOnly; }
    public void setGonosiaOnly(boolean gonosiaOnly) { isGonosiaOnly = gonosiaOnly; }
}
