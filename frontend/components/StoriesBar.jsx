"use client";

import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/free-mode';
import { getUserImage, getDisplayName } from "@/lib/imageHelpers";
import Link from "next/link";

export default function StoriesBar({ stories = [] }) {
  if (!stories || stories.length === 0) return null;

  return (
    <div className="stories-bar-modern">
      <Swiper
        modules={[FreeMode]}
        spaceBetween={12}
        slidesPerView="auto"
        freeMode={true}
        className="stories-swiper"
      >
        {stories.map((story, index) => {
          const userImage = getUserImage(story.user || story);
          const displayName = getDisplayName(story.user || story);
          const hasNewStory = story.hasUnseenStory || !story.viewed;

          return (
            <SwiperSlide key={story._id || index} className="story-slide">
              <Link href={`/stories/${story.userId || story._id}`} className="story-item">
                <div className={`story-avatar-wrapper ${hasNewStory ? 'has-story' : 'viewed'}`}>
                  {userImage ? (
                    <img src={userImage} alt={displayName} className="story-avatar" />
                  ) : (
                    <div className="story-avatar-placeholder">
                      {displayName[0]?.toUpperCase()}
                    </div>
                  )}
                  {story.isLive && (
                    <div className="story-live-badge">LIVE</div>
                  )}
                </div>
                <span className="story-username">{displayName}</span>
              </Link>
            </SwiperSlide>
          );
        })}
      </Swiper>
    </div>
  );
}
