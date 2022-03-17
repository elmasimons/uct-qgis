/**
 * Copyright 2022 Sourcepole AG
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import {setLayerDimensions} from '../actions/layers';
import {setCurrentTask, setCurrentTaskBlocked} from '../actions/task';
import Icon from '../components/Icon';
import ButtonBar from '../components/widgets/ButtonBar';
import NumberInput from '../components/widgets/NumberInput';
import ToggleSwitch from '../components/widgets/ToggleSwitch';
import ResizeableWindow from '../components/ResizeableWindow';
import LayerUtils from '../utils/LayerUtils';
import LocaleUtils from '../utils/LocaleUtils';
import './style/TimeManager.css';


dayjs.extend(utc);

class TimeManager extends React.Component {
    static propTypes = {
        active: PropTypes.bool,
        layerUUIds: PropTypes.array,
        layers: PropTypes.array,
        setCurrentTask: PropTypes.func,
        setLayerDimensions: PropTypes.func
    }
    static defaultState = {
        animationActive: false,
        animationSpeed: 1,
        animationSpeedUnit: 'd', // 1 day
        timeEnabled: false,
        timeData: {
            layerDimensions: {},
            values: []
        },
        currentTimestamp: "",
        settingsPopup: false
    }
    constructor(props) {
        super(props);
        this.state = TimeManager.defaultState;
        this.animationTimer = null;
    }
    componentDidUpdate(prevProps, prevState) {
        if (!this.props.active && prevProps.active) {
            this.setState(TimeManager.defaultState);
        }
        if (this.props.layerUUIds !== prevProps.layerUUIds) {
            const timeData = {
                layerDimensions: {},
                values: new Set()
            };
            this.props.layers.forEach(layer => {
                if (layer.type === "wms") {
                    const layertimeData = LayerUtils.getTimeDimensionValues(layer);
                    timeData.layerDimensions[layer.id] = [...layertimeData.names];
                    layertimeData.values.forEach(x => timeData.values.add(x));
                }
            });
            timeData.values = [...timeData.values].sort().map(d => dayjs.utc(d));
            this.setState({timeData: timeData});
            this.updateLayerTimeDimensions(timeData.layerDimensions, this.state.currentTimestamp);
        }
        if (this.state.currentTimestamp !== prevState.currentTimestamp || this.state.timeEnabled !== prevState.timeEnabled) {
            this.updateLayerTimeDimensions(this.state.timeData.layerDimensions, this.state.currentTimestamp);
        }
    }
    render() {
        if (!this.props.active) {
            return null;
        }
        const timeValues = this.state.timeData.values;
        let body = null;
        if (timeValues.length < 2) {
            body = (<div role="body"><div className="time-manager-notemporaldata">{LocaleUtils.tr("timemanager.notemporaldata")}</div></div>);
        } else {
            body = this.renderBody(timeValues);
        }
        return (
            <ResizeableWindow dockable="bottom"  icon="time" initialHeight={140}
                initialWidth={800}  onClose={this.onClose}
                scrollable title={LocaleUtils.tr("timemanager.title")}>
                {body}
            </ResizeableWindow>
        );
    }
    renderBody = (timeValues) => {
        const timeButtons = [
            {key: "rewind", tooltip: LocaleUtils.trmsg("timemanager.rewind"), icon: "rewind"},
            {key: "stop", tooltip: LocaleUtils.trmsg("timemanager.stop"), icon: "square", disabled: !this.state.animationActive},
            {key: "play", tooltip: LocaleUtils.trmsg("timemanager.play"), icon: "triangle-right", disabled: this.state.animationActive}
        ];
        // Time span, in seconds
        const deltaT = timeValues[timeValues.length - 1].diff(timeValues[0]);
        const perc = (dayjs(this.state.currentTimestamp).diff(timeValues[0]) / deltaT * 100).toFixed(2) + "%";
        const cursorStyle = {
            left: perc
        };
        const labelStyle = {
            transform: "translateX(-" + perc + ")"
        };

        const options = (
            <div className="time-manager-options">
                <div>
                    <span>{LocaleUtils.tr("timemanager.animspeed")}:</span>
                    <NumberInput max={100} min={1} onChange={value => this.setState({animationSpeed: value})} value={this.state.animationSpeed} />
                    <select onChange={ev => this.setState({animationSpeedUnit: ev.target.value})} value={this.state.animationSpeedUnit}>
                        <option key="s" value="s">{LocaleUtils.tr("timemanager.unit.seconds")}</option>
                        <option key="m" value="m">{LocaleUtils.tr("timemanager.unit.minutes")}</option>
                        <option key="h" value="h">{LocaleUtils.tr("timemanager.unit.hours")}</option>
                        <option key="d" value="d">{LocaleUtils.tr("timemanager.unit.days")}</option>
                        <option key="M" value="M">{LocaleUtils.tr("timemanager.unit.months")}</option>
                        <option key="y" value="y">{LocaleUtils.tr("timemanager.unit.years")}</option>
                    </select>
                    <span>{LocaleUtils.tr("timemanager.persecond")}</span>
                </div>
            </div>
        );

        return (
            <div className="time-manager-body" role="body">
                <div className="time-manager-toolbar">
                    <span>{LocaleUtils.tr("timemanager.toggle")}</span>
                    <ToggleSwitch active={this.state.timeEnabled} onChange={this.toggleTimeEnabled} />
                    <ButtonBar buttons={timeButtons} disabled={!this.state.timeEnabled} onClick={this.animationButtonClicked} />
                    <span className="time-manager-toolbar-spacer" />
                    <span className="time-manager-options-menubutton">
                        <button className={"button" + (this.state.settingsPopup ? " pressed" : "")} onClick={() => this.setState({settingsPopup: !this.state.settingsPopup})}>
                            <Icon icon="cog" />
                        </button>
                        {this.state.settingsPopup ? options : null}
                    </span>
                </div>
                <div className="time-manager-timeline">
                    <div className="time-manager-time-blocks" onClick={this.pickCurrentTimestamp} />
                    {this.state.timeEnabled ? (
                        <div className="time-manager-cursor" style={cursorStyle}>
                            <div className="time-manager-cursor-label" style={labelStyle}>
                                {dayjs(this.state.currentTimestamp).format("YYYY-MM-DD[\n]HH:mm:ss")}
                            </div>
                        </div>
                    ) : null}
                    <div className="time-manager-ticks">
                        <div>{timeValues[0].format('YYYY-MM-DD')}</div>
                        <div>{timeValues[timeValues.length - 1].format('YYYY-MM-DD')}</div>
                    </div>
                </div>
            </div>
        );
    }
    toggleTimeEnabled = (enabled) => {
        clearInterval(this.animationTimer);
        this.animationTimer = null;
        const timeValues = this.state.timeData.values;
        this.setState({timeEnabled: enabled, currentTimestamp: (+timeValues[0]) || 0, animationActive: false});
    }
    pickCurrentTimestamp = (ev) => {
        if (!this.state.timeEnabled) {
            return;
        }
        const pos = ev.clientX;
        const rect = ev.currentTarget.getBoundingClientRect();
        const perc = (pos - rect.left) / rect.width;
        const timeValues = this.state.timeData.values;
        const deltaT = timeValues[timeValues.length - 1].diff(timeValues[0]);
        const currentTimestamp = timeValues[0].add(perc * deltaT, 'ms');
        this.setState({currentTimestamp: currentTimestamp});
    }
    animationButtonClicked = (action) => {
        if (action === "rewind") {
            clearInterval(this.animationTimer);
            this.animationTimer = null;
            const timeValues = this.state.timeData.values;
            this.setState({currentTimestamp: (+timeValues[0]) || 0, animationActive: false});
        } else if (action === "stop") {
            clearInterval(this.animationTimer);
            this.animationTimer = null;
            this.setState({animationActive: false});
        } else if (action === "play") {
            this.animationTimer = setInterval(() => {
                this.advanceAnimation();
            }, 1000);
            this.setState({animationActive: true});
        }
    }
    advanceAnimation = () => {
        const timeValues = this.state.timeData.values;
        const day = dayjs(this.state.currentTimestamp);
        const newday = day.add(this.state.animationSpeed, this.state.animationSpeedUnit);
        const lastday = timeValues[timeValues.length - 1];
        if (newday > lastday) {
            this.setState({currentTimestamp: +lastday, animationActive: false});
            clearInterval(this.animationTimer);
            this.animationTimer = null;
        } else {
            this.setState({currentTimestamp: +newday});
        }
    }
    onClose = () => {
        this.toggleTimeEnabled(false);
        this.props.setCurrentTask(null);
    }
    updateLayerTimeDimensions = (timeDimensions, currentTimestamp) => {
        const currentTime = this.state.timeEnabled ? new Date(currentTimestamp).toISOString() : undefined;
        this.props.layers.forEach(layer => {
            if (layer.id in timeDimensions) {
                const dimensions = timeDimensions[layer.id].reduce((res, dimension) => {
                    res[dimension] = currentTime;
                    return res;
                }, {...(layer.dimensionValues || {})});
                this.props.setLayerDimensions(layer.id, dimensions);
            }
        });
    }
}

export default connect((state) => ({
    active: state.task.id === "TimeManager",
    layers: state.layers.flat,
    layerUUIds: state.layers.uuids
}), {
    setLayerDimensions: setLayerDimensions,
    setCurrentTask: setCurrentTask,
    setCurrentTaskBlocked: setCurrentTaskBlocked
})(TimeManager);