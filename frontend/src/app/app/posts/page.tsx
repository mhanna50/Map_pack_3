"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Drawer } from "@/components/drawer";
import { useToast } from "@/components/toast";

const mockPosts = [
  { id: 1, topic: "Summer tune-up", location: "Downtown", status: "Scheduled", date: "Aug 12", details: "Rotating offer" },
  { id: 2, topic: "Emergency service", location: "Uptown", status: "Posted", date: "Aug 10", details: "Posted with photo" },
  { id: 3, topic: "Financing offer", location: "Downtown", status: "Failed", date: "Aug 9", error: "Image rejected", details: "CTA missing" },
];

type Post = (typeof mockPosts)[number];

export default function PostsPage() {
  const [showModal, setShowModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const { pushToast } = useToast();
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Posts</h1>
          <p className="text-sm text-slate-600">List view of upcoming and past posts.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white"
        >
          Create Post
        </button>
      </header>
      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="px-3 py-2">Topic</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {mockPosts.map((post) => (
              <tr key={post.id} className="border-t border-slate-100">
                <td className="px-3 py-3 font-medium text-slate-800">{post.topic}</td>
                <td className="px-3 py-3 text-slate-600">{post.location}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={post.status} />
                  {post.error && <p className="text-xs text-red-500">{post.error}</p>}
                </td>
                <td className="px-3 py-3 text-slate-600">{post.date}</td>
                <td className="px-3 py-3">
                  <button className="text-sm font-semibold text-primary" onClick={() => setSelectedPost(post)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showModal && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Create post</h2>
              <button className="text-sm text-slate-500" onClick={() => setShowModal(false)}>
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="text-slate-600">Location</span>
                <select className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2">
                  <option>Downtown</option>
                  <option>Uptown</option>
                </select>
              </label>
              <label className="block">
                <span className="text-slate-600">Topic / service</span>
                <input className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2" placeholder="Tune-up" />
              </label>
              <label className="flex items-center gap-2 text-slate-600">
                <input type="checkbox" />
                AI generate caption
              </label>
              <label className="block">
                <span className="text-slate-600">Schedule time</span>
                <input type="datetime-local" className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-slate-600">Attach photo</span>
                <input type="file" className="mt-1 block w-full text-xs" />
              </label>
            </div>
            <div className="flex justify-end gap-2 text-sm font-semibold">
              <button className="rounded-full border border-slate-200 px-4 py-2 text-slate-600" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                className="rounded-full bg-primary px-4 py-2 text-white"
                onClick={() => {
                  setShowModal(false);
                  pushToast({ title: "Post scheduled", description: "We’ll publish at the selected time.", tone: "success" });
                }}
              >
                Schedule post
              </button>
            </div>
          </div>
        </div>
      )}
      <Drawer open={Boolean(selectedPost)} onClose={() => setSelectedPost(null)} title="Post detail">
        {selectedPost && (
          <div className="space-y-4 text-sm text-slate-600">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-primary">Topic</p>
              <p className="text-base font-semibold text-slate-900">{selectedPost.topic}</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-primary">Location</p>
                <p className="font-semibold text-slate-900">{selectedPost.location}</p>
                <p>{selectedPost.details}</p>
              </div>
              <StatusBadge status={selectedPost.status} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-primary">Schedule</p>
              <p>{selectedPost.date}</p>
            </div>
            {selectedPost.error && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-rose-700">
                Error: {selectedPost.error}. Retry once the content is updated.
              </div>
            )}
            <button
              className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              onClick={() => {
                pushToast({ title: "Retry queued", description: "We’ll re-attempt publishing shortly." });
                setSelectedPost(null);
              }}
            >
              Retry post
            </button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
